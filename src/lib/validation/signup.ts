import { z } from "zod";

export const signupRoleEnum = z.enum(["ADMIN", "STORE", "CUSTOMER"]);
export type SignupRole = z.infer<typeof signupRoleEnum>;

export const signupInputSchema = z
  .object({
    role: signupRoleEnum,
    displayName: z.string().trim().min(1).max(120),
    email: z.string().trim().email(),
    password: z.string().min(6),
    confirmPassword: z.string().min(6),
    code: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.role === "CUSTOMER" || !!data.code, {
    message: "A signup code is required for this account type.",
    path: ["code"],
  });
export type SignupInput = z.infer<typeof signupInputSchema>;
