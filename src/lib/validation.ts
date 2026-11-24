// Shared input validation for the checkout / registration / contact forms.
//
// The same schema runs on the client (inline errors) and on the server
// (authoritative). Rules live here so the two cannot drift.
import { z } from "zod";

/** Rwandan mobile numbers: 078/072/073/079 and the +250 forms. */
const PHONE = /^(?:\+?250|0)?7[2389]\d{7}$/;

export function normalisePhone(input: string) {
  return input.replace(/[\s()-]/g, "");
}

export const PHONE_REGEX = PHONE;

export const deliverySchema = z.object({
  fullName: z.string().trim().min(2, "Please enter the full name.").max(80, "Please use 80 characters or fewer."),
  phone: z
    .string()
    .transform(normalisePhone)
    .refine((value) => PHONE.test(value), "Please enter a valid Rwandan phone number, e.g. 0788123456."),
  province: z.string().trim().min(1, "Please enter the province.").max(60, "Please use 60 characters or fewer."),
  district: z.string().trim().min(1, "Please enter the district.").max(60, "Please use 60 characters or fewer."),
  sector: z.string().trim().min(1, "Please enter the sector.").max(60, "Please use 60 characters or fewer."),
  address: z.string().trim().min(5, "Please enter the delivery address.").max(200, "Please use 200 characters or fewer."),
  instructions: z.string().trim().max(500, "Please use 500 characters or fewer.").optional().default(""),
});

export const cartItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1, "Quantity must be at least 1.").max(1000, "Quantity is too large."),
});

export const checkoutSchema = z.object({
  items: z.array(cartItemSchema).min(1, "Your cart is empty.").max(50, "Too many different products in one order."),
  delivery: deliverySchema,
  paymentMethod: z.enum(["mobile_money", "cash", "card"], "Please select a valid payment method."),
});

export const registrationSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(80, "Please use 80 characters or fewer."),
  email: z.email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128, "Password is too long."),
  phone: z
    .string()
    .transform(normalisePhone)
    .refine((value) => value === "" || PHONE.test(value), "Please enter a valid Rwandan phone number.")
    .optional()
    .default(""),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(80),
  contact: z.string().trim().min(3, "Please enter an email or phone number.").max(120),
  message: z.string().trim().min(10, "Please write a short message.").max(2000),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Please enter your current password."),
  newPassword: z.string().min(8, "Password must be at least 8 characters.").max(128, "Password is too long."),
});

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "12345678",
  "123456789",
  "qwertyui",
  "iloveyou",
  "admin123",
  "admin1234",
  "letmein1",
  "welcome1",
  "egghub123",
]);

/** Returns a message when the password is too predictable for the given email. */
export function passwordWeakness(password: string, email?: string): string | null {
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return "Please choose a less common password.";
  if (email && lower === email.toLowerCase()) return "Your password cannot be your email address.";
  if (/^(.)\1+$/.test(password)) return "Please choose a password with more than one repeated character.";
  return null;
}

/** First error message from a Zod result, ready to show to a user. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}
