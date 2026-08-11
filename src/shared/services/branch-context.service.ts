import { Roles } from "@prisma/client";
import { prisma } from "../db/prisma";

const branchError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

type BranchUser = {
  businessId?: string;
  branchId?: string;
  role?: string;
};

export async function requireOwnedBranch(
  businessId: string,
  branchId: string,
  options: { activeOnly?: boolean } = {},
) {
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      businessId,
      ...(options.activeOnly === false ? {} : { isActive: true }),
    },
  });

  if (!branch) {
    throw branchError("Branch not found", 404, "BRANCH_NOT_FOUND");
  }
  return branch;
}

export async function resolveOperationalBranch(
  user: BranchUser,
  requestedBranchId?: string,
) {
  if (!user.businessId) {
    throw branchError(
      "Business context missing",
      403,
      "BUSINESS_CONTEXT_REQUIRED",
    );
  }

  const isBranchBound =
    user.role === Roles.Receptionist || user.role === Roles.Staff;

  if (isBranchBound) {
    if (!user.branchId) {
      throw branchError(
        "Branch context missing for this account",
        403,
        "BRANCH_CONTEXT_REQUIRED",
      );
    }
    if (requestedBranchId && requestedBranchId !== user.branchId) {
      throw branchError("Forbidden", 403, "FORBIDDEN");
    }

    const branch = await requireOwnedBranch(user.businessId, user.branchId);
    return { businessId: user.businessId, branchId: branch.id, branch };
  }

  if (!requestedBranchId) {
    throw branchError(
      "Select a branch for this operation",
      400,
      "BRANCH_REQUIRED",
    );
  }

  const branch = await requireOwnedBranch(user.businessId, requestedBranchId);
  return { businessId: user.businessId, branchId: branch.id, branch };
}
