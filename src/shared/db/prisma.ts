import { PrismaClient } from "@prisma/client";
import { DATABASE } from "../config/config";

export const prisma = new PrismaClient();
