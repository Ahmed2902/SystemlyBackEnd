import { ApplicationError, Errors, isApplicationError } from "./application-error";

describe("ApplicationError", () => {
  test("creates an exposed operational error", () => {
    const error = Errors.conflict("Slot taken", "SLOT_TAKEN");

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      statusCode: 409,
      code: "SLOT_TAKEN",
      message: "Slot taken",
      expose: true,
    });
    expect(isApplicationError(error)).toBe(true);
  });

  test("does not expose internal errors by default", () => {
    expect(Errors.internal("database password leaked").expose).toBe(false);
  });
});
