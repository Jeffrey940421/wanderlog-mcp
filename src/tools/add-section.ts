import { z } from "zod";
import type { AppContext } from "../context.js";
import { WanderlogError } from "../errors.js";
import type { Json0Op } from "../ot/apply.js";
import type { Section } from "../types.js";
import { generateBlockId, submitOp } from "./shared.js";

export const addSectionInputSchema = {
  trip_key: z
    .string()
    .min(1)
    .describe("The trip to add the section to."),
  heading: z
    .string()
    .min(1)
    .describe("The name/heading for the new section. E.g. '寿司', '焼肉', '景点'."),
};

export const addSectionDescription = `
Creates a new custom section under the trip's Overview tab (a "normal" + "placeList" section).
Use this to organize places into named groups like "Restaurants", "Sights", or by cuisine type.

Returns the section index so you can later add places to it via wanderlog_add_place with the
section's heading as the day parameter.
`.trim();

type Args = {
  trip_key: string;
  heading: string;
};

export async function addSection(
  ctx: AppContext,
  args: Args,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    const userId = ctx.userId;
    if (!userId) {
      throw new WanderlogError("User not authenticated", "no_user_id");
    }

    const trip = await ctx.tripCache.get(args.trip_key);

    // Check for duplicate heading
    for (const section of trip.itinerary.sections) {
      if (
        section.type === "normal" &&
        section.mode === "placeList" &&
        section.heading === args.heading
      ) {
        return {
          content: [
            {
              type: "text",
              text: `Section "${args.heading}" already exists in "${trip.title}". No changes made.`,
            },
          ],
        };
      }
    }

    // Build the new section matching Wanderlog's shape for custom placeList sections
    const newSection: Section = {
      id: generateBlockId(),
      type: "normal",
      mode: "placeList",
      heading: args.heading,
      date: null,
      text: { ops: [{ insert: "\n" }] },
      blocks: [],
    } as Section;

    // Insert at the end of the sections array (after dayPlan sections, before hotels/flights)
    // Find the right insert position: after the last "normal" section, but before hotels/flights/transit
    let insertIndex = trip.itinerary.sections.length;
    for (let i = trip.itinerary.sections.length - 1; i >= 0; i--) {
      const s = trip.itinerary.sections[i]!;
      if (s.type === "normal" && (s.mode === "placeList" || s.mode === "dayPlan")) {
        insertIndex = i + 1;
        break;
      }
    }

    const ops: Json0Op[] = [
      {
        p: ["itinerary", "sections", insertIndex],
        li: newSection,
      },
    ];

    await submitOp(ctx, args.trip_key, ops);

    return {
      content: [
        {
          type: "text",
          text: `Created section "${args.heading}" in "${trip.title}" at index ${insertIndex}. You can now add places to it with wanderlog_add_place(trip_key: "${args.trip_key}", place: "...", day: "${args.heading}").`,
        },
      ],
    };
  } catch (err) {
    const msg =
      err instanceof WanderlogError
        ? err.toUserMessage()
        : `Unexpected error: ${(err as Error).message}`;
    return { content: [{ type: "text", text: msg }], isError: true };
  }
}
