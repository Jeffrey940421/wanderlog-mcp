import { z } from "zod";
import type { AppContext } from "../context.js";
import { WanderlogError } from "../errors.js";
import type { Json0Op } from "../ot/apply.js";
import { findSectionByHeading, submitOp } from "./shared.js";

export const removeSectionInputSchema = {
  trip_key: z.string().min(1).describe("The trip to remove the section from."),
  heading: z.string().min(1).describe("The heading name of the section to remove. E.g. '寿司', '焼肉'."),
};

export const removeSectionDescription = `
Removes a custom section (normal+placeList) from a trip by its heading name.
This deletes the section AND all places within it. Cannot be undone.
`.trim();

type Args = { trip_key: string; heading: string };

export async function removeSection(ctx: AppContext, args: Args) {
  try {
    const trip = await ctx.tripCache.get(args.trip_key);
    const found = findSectionByHeading(trip, args.heading);
    if (!found) {
      return { content: [{ type: "text" as const, text: `Section "${args.heading}" not found in "${trip.title}".` }], isError: false };
    }

    const ops: Json0Op[] = [{ p: ["itinerary", "sections", found.index], ld: found.section }];
    await submitOp(ctx, args.trip_key, ops);

    return { content: [{ type: "text" as const, text: `Removed section "${args.heading}" from "${trip.title}".` }], isError: false };
  } catch (err) {
    const msg = err instanceof WanderlogError ? err.toUserMessage() : `Unexpected error: ${(err as Error).message}`;
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
}
