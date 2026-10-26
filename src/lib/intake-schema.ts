import { z } from "zod";

export const intakeSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(100),
  email: z.string().trim().email("Enter a valid email address.").max(255),
  phone: z.string().trim().max(40).regex(/^[+\d\s().-]*$/, "Enter a valid phone number."),
  practice_area: z.enum(["litigation", "conveyancing", "corporate", "family", "labour", "criminal", "other"]),
  opposing_party: z.string().trim().max(200),
  related_names: z.string().trim().max(500),
  summary: z.string().trim().min(10, "Please give a brief description of at least 10 characters.").max(3000),
  consent: z.literal(true, { errorMap: () => ({ message: "Please agree to the use of your details for this inquiry." }) }),
  website: z.string().max(0),
});

export type IntakeInput = z.infer<typeof intakeSchema>;