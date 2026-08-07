import { Prisma } from "@prisma/client";
import { withSerializableRetry } from "../src/shared/db/transaction-retry";

function serializationConflict() {
  return new Prisma.PrismaClientKnownRequestError("serialization conflict", {
    code: "P2034",
    clientVersion: "6.19.3",
  });
}

describe("withSerializableRetry", () => {
  test("retries a transient P2034 and returns the successful result", async () => {
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(serializationConflict())
      .mockResolvedValueOnce("ok");

    await expect(withSerializableRetry(operation)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  test("does not retry unrelated errors", async () => {
    const operation = jest.fn<Promise<string>, []>().mockRejectedValueOnce(
      new Error("not retryable"),
    );

    await expect(withSerializableRetry(operation)).rejects.toThrow(
      "not retryable",
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
