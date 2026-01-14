import { z } from "zod";
import { isValidObjectId } from "mongoose";

import type { User } from "./user.zod";


// GenderType Enum
export const GenderType = z.enum(["male", "female", "other", "prefer_not_to_say", "unknown", "not_applicable"]);

export type GenderType = z.infer<typeof GenderType>;

// PhoneType Enum
export const PhoneType = z.enum(["mobile", "home", "work", "emergency", "fax", "pager", "main", "other"]);

export type PhoneType = z.infer<typeof PhoneType>;

// IdentificationType Enum
export const IdentificationType = z.enum(["passport", "drivers_license", "national_id", "postal_id", "voters_id", "senior_citizen_id", "company_id", "school_id"]);

export type IdentificationType = z.infer<typeof IdentificationType>;

// PersonalInfo Schema
export const PersonalInfoSchema = z.object({
	prefix: z.string().optional(),
	firstName: z.string().min(1),
	middleName: z.string().optional(),
	lastName: z.string().min(1),
	dateOfBirth: z.coerce.date().optional(),
	placeOfBirth: z.string().optional(),
	age: z.number().int().optional(),
	nationality: z.string().optional(),
	primaryLanguage: z.string().optional(),
	gender: z.enum(["male", "female", "other", "prefer_not_to_say", "unknown", "not_applicable"]).optional(),
	currency: z.string().optional(),
	vipCode: z.string().optional(),
});

export type PersonalInfo = z.infer<typeof PersonalInfoSchema>;

// Phone Schema
export const PhoneSchema = z.object({
	type: z.enum(["mobile", "home", "work", "emergency", "fax", "pager", "main", "other"]).optional(),
	countryCode: z.string().optional(),
	number: z.string().optional(),
	isPrimary: z.boolean().optional(),
});

export type Phone = z.infer<typeof PhoneSchema>;

// ContactAddress Schema
export const ContactAddressSchema = z.object({
	street: z.string().optional(),
	address2: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	country: z.string().optional(),
	postalCode: z.string().optional(),
	zipCode: z.string().optional(),
	houseNumber: z.string().optional(),
});

export type ContactAddress = z.infer<typeof ContactAddressSchema>;

// ContactInfo Schema
export const ContactInfoSchema = z.object({
	email: z.string().optional(),
	phones: z.array(PhoneSchema),
	fax: z.string().optional(),
	address: z.array(ContactAddressSchema),
});

export type ContactInfo = z.infer<typeof ContactInfoSchema>;

// Identification Schema
export const IdentificationSchema = z.object({
	type: z.enum(["passport", "drivers_license", "national_id", "postal_id", "voters_id", "senior_citizen_id", "company_id", "school_id"]).optional(),
	number: z.string().optional(),
	issuingCountry: z.string().optional(),
	expiryDate: z.coerce.date().optional(),
});

export type Identification = z.infer<typeof IdentificationSchema>;

// Metadata Schema
export const MetadataSchema = z.object({
	isActive: z.boolean(),
	status: z.string().optional(),
	createdBy: z.string().refine((val) => isValidObjectId(val)).optional(),
	updatedBy: z.string().refine((val) => isValidObjectId(val)).optional(),
	lastLoginAt: z.coerce.date().optional(),
	isDeleted: z.boolean(),
});

export type Metadata = z.infer<typeof MetadataSchema>;

// Person Schema (full, including ID)
export const PersonSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().refine((val) => isValidObjectId(val)).optional(),
	personalInfo: PersonalInfoSchema.optional(),
	contactInfo: ContactInfoSchema,
	identification: IdentificationSchema.optional(),
	metadata: MetadataSchema.optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	isDeleted: z.boolean(),
});

export type Person = z.infer<typeof PersonSchema>;

// Create Person Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreatePersonSchema = PersonSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	organizationId: true,
	personalInfo: true,
	identification: true,
	metadata: true,
	isDeleted: true,
});

export type CreatePerson = z.infer<typeof CreatePersonSchema>;

// Update Person Schema (partial, excluding immutable fields and relations)
export const UpdatePersonSchema = PersonSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdatePerson = z.infer<typeof UpdatePersonSchema>;

export type PersonWithRelations = Person & {
	users: User[];
};
