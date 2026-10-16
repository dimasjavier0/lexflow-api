import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { FacebookTokenError, FacebookUnavailableError, readFacebookAccount, type FacebookAccount } from "../services/facebook.js";

const connectFacebookSchema = z.object({
  /** The Facebook token Supabase hands the web app right after a Facebook sign-in (`session.provider_token`). */
  accessToken: z.string().trim().min(20).max(2048),
});

/** Words a learner knows, counted as the profile counts them: marked as learned, or mastered in review. */
const knownWordsWhere = {
  OR: [{ status: "LEARNED" as const }, { status: "WANT_TO_LEARN" as const, stage: "MASTERED" as const }],
};

async function countKnownWords(userIds: string[]): Promise<Map<string, number>> {
  const rows = await prisma.userWordProgress.groupBy({ by: ["userId"], where: { userId: { in: userIds }, ...knownWordsWhere }, _count: { _all: true } });
  return new Map(rows.map((row) => [row.userId, row._count._all]));
}

/**
 * Links the learner's Facebook account and replaces their friendships with the friend list
 * Facebook returns now. That list is the whole truth about this learner, so it also drops a
 * friendship someone else's older sign-in recorded with them.
 */
export async function connectFacebook(request: Request, response: Response): Promise<void> {
  const authUser = request.authUser;
  const parsed = connectFacebookSchema.safeParse(request.body);
  if (!authUser || !parsed.success) {
    response.status(400).json({ message: "Invalid Facebook token" });
    return;
  }
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appSecret) {
    response.status(503).json({ message: "Facebook sign-in is not configured" });
    return;
  }

  let account: FacebookAccount;
  try {
    account = await readFacebookAccount(parsed.data.accessToken, appSecret);
  } catch (error) {
    if (error instanceof FacebookTokenError) {
      response.status(400).json({ message: "Invalid Facebook token" });
      return;
    }
    if (error instanceof FacebookUnavailableError) {
      console.warn(error.message);
      response.status(502).json({ message: "Facebook is unavailable" });
      return;
    }
    throw error;
  }

  // Supabase links a Facebook identity to one account only, so a match elsewhere is a token that is not this learner's.
  const owner = await prisma.user.findUnique({ where: { facebookId: account.id }, select: { id: true } });
  if (owner && owner.id !== authUser.id) {
    response.status(409).json({ message: "This Facebook account belongs to another user" });
    return;
  }

  const friends = account.friendIds.length
    ? await prisma.user.findMany({ where: { facebookId: { in: account.friendIds }, facebookFriendsGranted: true, id: { not: authUser.id } }, select: { id: true } })
    : [];
  await prisma.$transaction([
    prisma.user.update({ where: { id: authUser.id }, data: { facebookId: account.id, facebookFriendsGranted: account.friendsGranted } }),
    prisma.friendship.deleteMany({ where: { OR: [{ userId: authUser.id }, { friendId: authUser.id }] } }),
    prisma.friendship.createMany({
      data: friends.flatMap((friend) => [
        { userId: authUser.id, friendId: friend.id },
        { userId: friend.id, friendId: authUser.id },
      ]),
    }),
  ]);

  response.status(200).json({ friendsGranted: account.friendsGranted, friends: friends.length });
}

/** The learner and their Facebook friends on LexFlow, with the words each one knows, most first. */
export async function listFriends(request: Request, response: Response): Promise<void> {
  const authUser = request.authUser;
  if (!authUser) {
    response.status(401).json({ message: "Authentication required" });
    return;
  }

  const person = { id: true, name: true, avatarUrl: true } as const;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: authUser.id },
    select: { ...person, facebookId: true, facebookFriendsGranted: true, friends: { select: { friend: { select: person } } } },
  });
  const friends = user.friends.map((row) => row.friend);
  const knownWords = await countKnownWords([user.id, ...friends.map((friend) => friend.id)]);
  const withKnownWords = (row: { id: string; name: string | null; avatarUrl: string | null }) => ({ ...row, knownWords: knownWords.get(row.id) ?? 0 });

  response.status(200).json({
    facebook: { connected: user.facebookId !== null, friendsGranted: user.facebookFriendsGranted },
    me: withKnownWords({ id: user.id, name: user.name, avatarUrl: user.avatarUrl }),
    friends: friends
      .map(withKnownWords)
      .sort((a, b) => b.knownWords - a.knownWords || (a.name ?? "").localeCompare(b.name ?? "", "es")),
  });
}
