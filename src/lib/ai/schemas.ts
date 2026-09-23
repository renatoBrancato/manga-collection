import { z } from "zod";

const nullableText = z.string().trim().nullable().optional();
const nullableNumber = z.number().nullable().optional();
const nullableBoolean = z.boolean().nullable().optional();

const mangaFields = {
  series: z.string().trim().min(1),
  format: z.enum(["tankobon", "zashi"]),
  volume_number: nullableNumber,
  issue_number: nullableText,
  release_year: z.number().int().min(1800).max(2100).nullable().optional(),
  publisher: nullableText,
  isbn: nullableText,
  is_first_print: nullableBoolean,
  has_obi: nullableBoolean,
  printing_notes: nullableText,
  grading_authority: z.enum(["CGC", "CBCS", "BGS", "altro"]).nullable().optional(),
  grading_value: nullableNumber,
  condition_estimate: nullableText,
  language: nullableText,
  estimated_value: nullableNumber,
  currency: z.string().trim().length(3),
  image_url: nullableText,
  notes: nullableText,
};

export const mangaMutationSchema = z.object({
  ...mangaFields,
  format: mangaFields.format.default("tankobon"),
  currency: mangaFields.currency.default("EUR"),
});

export const mangaPatchSchema = z
  .object({
    id: z.string().uuid(),
    series: mangaFields.series.optional(),
    format: mangaFields.format.optional(),
    volume_number: mangaFields.volume_number,
    issue_number: mangaFields.issue_number,
    release_year: mangaFields.release_year,
    publisher: mangaFields.publisher,
    isbn: mangaFields.isbn,
    is_first_print: mangaFields.is_first_print,
    has_obi: mangaFields.has_obi,
    printing_notes: mangaFields.printing_notes,
    grading_authority: mangaFields.grading_authority,
    grading_value: mangaFields.grading_value,
    condition_estimate: mangaFields.condition_estimate,
    language: mangaFields.language,
    estimated_value: mangaFields.estimated_value,
    currency: mangaFields.currency.optional(),
    image_url: mangaFields.image_url,
    notes: mangaFields.notes,
  })
  .refine((payload) => Object.keys(payload).some((key) => key !== "id"), {
    message: "Nessun campo da aggiornare",
  });

export const chatActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add"),
    payload: mangaMutationSchema,
  }),
  z.object({
    type: z.literal("update"),
    payload: mangaPatchSchema,
  }),
  z.object({
    type: z.literal("delete"),
    payload: z.object({
      id: z.string().uuid(),
      series: z.string().trim().min(1),
      volume_number: z.number().nullable().optional(),
      issue_number: z.string().nullable().optional(),
    }),
  }),
]);

export type ChatAction = z.infer<typeof chatActionSchema>;

export const chatEntityContextSchema = z.object({
  id: z.string().uuid(),
  series: z.string(),
  volume_number: z.number().nullable(),
  issue_number: z.string().nullable(),
});

export type ChatEntityContext = z.infer<typeof chatEntityContextSchema>;
