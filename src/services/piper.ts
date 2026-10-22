import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveUpload, uploadUrl } from "./file-store.js";

/** Synthesizes `term` with Piper into the file store and returns the Audio row fields. */
export async function generatePiperAudio(baseUrl: string, wordId: string, term: string, accent: "US" | "UK") {
  const piperPath = process.env.PIPER_PATH ?? "piper";
  const configuredModelPath = accent === "UK" ? process.env.PIPER_VOICE_MODEL_UK : process.env.PIPER_VOICE_MODEL_US;
  // A relative path is resolved from the folder the API is started in: the repository root.
  const modelPath = configuredModelPath ? path.resolve(process.cwd(), configuredModelPath) : undefined;
  if (!modelPath || !existsSync(modelPath)) {
    throw new Error(`No se encontró el modelo Piper configurado: ${configuredModelPath ?? "sin ruta"}`);
  }

  const filename = `audio-${wordId}-${Date.now()}.wav`;
  // Piper writes to a file; the temporary folder is the only writable one on Lambda.
  const outputPath = path.join(os.tmpdir(), filename);
  try {
    const child = spawn(piperPath, ["--model", modelPath, "--output_file", outputPath], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const processError = new Promise<Error>((_, reject) => child.once("error", reject));
    const processClose = once(child, "close").then(([exitCode]) => {
      if (exitCode !== 0) throw new Error(stderr.trim() || `Piper terminó con código ${exitCode}`);
    });
    child.stdin.write(`${term}\n`);
    child.stdin.end();
    await Promise.race([processClose, processError]);
    await saveUpload(filename, await fs.readFile(outputPath), "audio/wav");
  } catch (error) {
    throw new Error(error instanceof Error ? `No se pudo generar el audio: ${error.message}` : "No se pudo generar el audio.");
  } finally {
    await fs.rm(outputPath, { force: true });
  }

  return { url: uploadUrl(baseUrl, filename), provider: "piper", voice: accent === "UK" ? "en_GB" : "en_US", accent, metadata: { text: term, filename } };
}
