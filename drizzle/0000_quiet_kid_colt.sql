CREATE TABLE "blog_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "blog_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "blog_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "blog_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "blog_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "blog_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"page" varchar(256) NOT NULL,
	"thread" integer,
	"author" varchar(256) NOT NULL,
	"content" json NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_rates" (
	"userId" varchar(256) NOT NULL,
	"commentId" integer NOT NULL,
	"like" boolean NOT NULL,
	CONSTRAINT "blog_rates_userId_commentId_pk" PRIMARY KEY("userId","commentId")
);
--> statement-breakpoint
CREATE TABLE "blog_roles" (
	"userId" varchar(256) PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"canDelete" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_kyc_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"applicant_id" text,
	"level_name" text NOT NULL,
	"status" text NOT NULL,
	"reviewed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_kyc_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_kyc_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"payload_hash" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blog_accounts" ADD CONSTRAINT "blog_accounts_user_id_blog_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."blog_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_sessions" ADD CONSTRAINT "blog_sessions_user_id_blog_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."blog_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_kyc_applications" ADD CONSTRAINT "blog_kyc_applications_user_id_blog_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."blog_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_kyc_challenges" ADD CONSTRAINT "blog_kyc_challenges_user_id_blog_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."blog_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_idx" ON "blog_rates" USING btree ("commentId");--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_application_wallet_idx" ON "blog_kyc_applications" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_application_provider_user_idx" ON "blog_kyc_applications" USING btree ("provider_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_challenge_nonce_idx" ON "blog_kyc_challenges" USING btree ("nonce");--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_webhook_payload_hash_idx" ON "blog_kyc_webhook_events" USING btree ("payload_hash");