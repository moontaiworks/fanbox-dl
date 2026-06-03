import { describe, expect, it } from "vitest";

import { resolveCreatorIds } from "./resolver.js";

describe("resolveCreatorIds", () => {
  it("unions explicit, following, and supporting creators before exclusions", async () => {
    const client = {
      listFollowingCreators: () =>
        Promise.resolve([{ creatorId: "followed" }, { creatorId: "shared" }]),
      listSupportingPlans: () =>
        Promise.resolve([{ creatorId: "supported" }, { creatorId: "shared" }]),
    };

    await expect(
      resolveCreatorIds(client, {
        creatorIds: ["explicit"],
        following: true,
        ignoreCreatorIds: ["shared"],
        supporting: true,
      }),
    ).resolves.toEqual(["explicit", "followed", "supported"]);
  });
});
