import { describe, expect, it } from "vitest";
import { median, suggestReason, type AttemptForSuggestion } from "./mistakes";

const base: AttemptForSuggestion = {
  answered: true,
  secondsSpent: 40,
  positionFromEnd: 50,
  totalQuestions: 100,
  typicalSeconds: 50,
  topicHistory: { attempted: 0, correct: 0 },
  timeRanOut: false,
};

describe("suggestReason", () => {
  it("marks blanks as not attempted", () => {
    expect(suggestReason({ ...base, answered: false })).toBe("not_attempted");
  });

  it("marks blanks at the end of a timed-out test as time pressure", () => {
    expect(suggestReason({ ...base, answered: false, positionFromEnd: 3, timeRanOut: true })).toBe("time_pressure");
  });

  it("marks very slow answers as time pressure", () => {
    expect(suggestReason({ ...base, secondsSpent: 130 })).toBe("time_pressure");
  });

  it("marks quick misses on a strong topic as silly errors", () => {
    expect(suggestReason({ ...base, topicHistory: { attempted: 10, correct: 8 } })).toBe("silly_error");
  });

  it("marks misses on a weak topic as concept gaps", () => {
    expect(suggestReason({ ...base, topicHistory: { attempted: 10, correct: 3 } })).toBe("concept_gap");
  });

  it("falls back to concept gap without enough history", () => {
    expect(suggestReason({ ...base, topicHistory: { attempted: 2, correct: 2 } })).toBe("concept_gap");
  });
});

describe("median", () => {
  it("ignores zeros and handles even counts", () => {
    expect(median([0, 10, 20, 30, 40])).toBe(25);
    expect(median([])).toBe(0);
  });
});
