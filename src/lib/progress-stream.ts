import type { Request, Response } from "express";

/** Media type a client sends in `Accept` to follow a long request step by step. */
export const PROGRESS_CONTENT_TYPE = "application/x-ndjson";

export type ProgressStep = {
  /** Items finished so far, out of `total`. */
  done: number;
  total: number;
  /** Name of the item that just finished, to show next to the bar. */
  item?: string;
  /** Running tallies, such as how many words got images and how many did not. */
  counts: Record<string, number>;
};

export type ProgressChannel = {
  report: (step: ProgressStep) => void;
  /** Sends the final body and closes the response. */
  finish: (status: number, body: unknown) => void;
};

/**
 * Lets a handler report progress while it works. A client that accepts NDJSON gets
 * one `progress` line per step and a last `result` line; any other client gets the
 * usual JSON body, so the endpoint keeps working without the stream.
 */
export function openProgress(request: Request, response: Response): ProgressChannel {
  const isStreaming = request.header("accept")?.includes(PROGRESS_CONTENT_TYPE) ?? false;

  const write = (line: unknown) => {
    // The admin may have closed the page: the work goes on, there is just nobody to tell.
    if (response.destroyed || response.writableEnded) return;
    if (!response.headersSent) {
      response.status(200);
      response.setHeader("Content-Type", `${PROGRESS_CONTENT_TYPE}; charset=utf-8`);
      response.setHeader("Cache-Control", "no-store");
      // Reverse proxies would otherwise hold the lines back until the end.
      response.setHeader("X-Accel-Buffering", "no");
    }
    response.write(`${JSON.stringify(line)}\n`);
  };

  return {
    report(step) {
      if (isStreaming) write({ type: "progress", ...step });
    },
    finish(status, body) {
      if (!isStreaming) {
        response.status(status).json(body);
        return;
      }
      write({ type: "result", body });
      response.end();
    },
  };
}

/** Whether a progress stream has already started on this response. */
export function isProgressStream(response: Response): boolean {
  return response.headersSent && String(response.getHeader("Content-Type") ?? "").startsWith(PROGRESS_CONTENT_TYPE);
}
