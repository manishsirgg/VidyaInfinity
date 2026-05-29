import { existsSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Compass,
  CreditCard,
  GraduationCap,
  Handshake,
  LineChart,
  MessageCircle,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

import { AboutAudienceTabs } from "@/components/about/about-audience-tabs";
import { AboutFaq } from "@/components/about/about-faq";

export const metadata: Metadata = {
  title:
    "About Vidya Infinity | Career Guidance, Course Discovery & Institute Growth",
  description:
    "Vidya Infinity connects students with trusted educational institutions through career guidance, course discovery, education consulting, student inquiries, CRM-based lead management, and enrollment support.",
};

const ctaRoutes = {
  exploreCourses: "/courses",
  instituteRegister: "/auth/register/institute",
  contact: "/contact",
} as const;

const heroImage = "/heroImage.png";
const studentGuidanceImage = "/studentGuidanceImage.png";
const instituteGrowthImage = "/instituteGrowthImage.png";
const careerCounsellingImage = "/careerCounsellingImage.png";

const aboutImageSlots = {
  heroImage,
  studentGuidanceImage,
  instituteGrowthImage,
  careerCounsellingImage,
} as const;

const trustBadges = [
  { title: "Career Guidance", Icon: Compass },
  { title: "Course Discovery", Icon: Search },
  { title: "Institute Visibility", Icon: Building2 },
  { title: "Enrollment Support", Icon: Handshake },
] as const;

const heroFloatingBadges = [
  {
    eyebrow: "Career",
    label: "Guidance",
    status: "Active",
    Icon: Compass,
    position: "left-3 top-3 sm:left-4 sm:top-4",
  },
  {
    eyebrow: "Courses",
    label: "Discovery",
    status: "Guided",
    Icon: Search,
    position: "right-3 top-3 sm:right-4 sm:top-4",
  },
  {
    eyebrow: "Leads",
    label: "Student Leads",
    status: "Tracked",
    Icon: Users,
    position: "bottom-3 left-3 sm:bottom-4 sm:left-4",
  },
  {
    eyebrow: "Enroll",
    label: "Pay & Enroll",
    status: "Supported",
    Icon: CreditCard,
    position: "bottom-3 right-3 sm:bottom-4 sm:right-4",
  },
] as const;

const problemCards = [
  {
    title: "For Students & Parents",
    text: "Choosing the right course, institute, or career path can be confusing. Students need clarity, trusted options, and guidance before making important education decisions.",
    Icon: GraduationCap,
  },
  {
    title: "For Institutes",
    text: "Many genuine institutes offer valuable courses but struggle to reach the right students because their strengths, programs, and achievements are not visible enough digitally.",
    Icon: Building2,
  },
] as const;

const whatWeDoCards = [
  {
    title: "Career Guidance",
    text: "We help students explore suitable academic, professional, and skill-based paths with more clarity.",
    Icon: Compass,
  },
  {
    title: "Course Discovery",
    text: "We make it easier for learners to discover courses, webinars, institutes, training programs, and education opportunities in one place.",
    Icon: Search,
  },
  {
    title: "Institute Visibility",
    text: "We help academies, coaching centers, colleges, universities, and training institutes showcase their courses, updates, achievements, and strengths professionally.",
    Icon: BadgeCheck,
  },
  {
    title: "Enrollment Support",
    text: "We support the student inquiry and enrollment journey through lead forms, CRM tracking, course listings, and Pay & Enroll features where applicable.",
    Icon: Handshake,
  },
] as const;

const ecosystemSteps = [
  {
    title: "Students Explore",
    text: "Students and parents discover courses, institutes, webinars, and career-related opportunities.",
  },
  {
    title: "Institutes Showcase",
    text: "Institutes create professional profiles, list courses, share updates, and promote learning opportunities.",
  },
  {
    title: "Inquiries Are Generated",
    text: "Interested students can send inquiries, register interest, attend webinars, or enroll where applicable.",
  },
  {
    title: "Growth Becomes Organized",
    text: "Institutes manage leads, follow-ups, notes, and student records through Vidya Infinity’s built-in CRM system.",
  },
] as const;

const studentBenefits = [
  "Explore courses and institutes",
  "Discover webinars and learning opportunities",
  "Receive career-focused direction",
  "Compare options with more clarity",
  "Connect with genuine education providers",
] as const;

const instituteBenefits = [
  "Create a professional institute profile",
  "List courses in a structured format",
  "Improve online visibility and discoverability",
  "Promote webinars, events, achievements, and announcements",
  "Receive genuine student inquiries",
  "Track every lead, note, and follow-up",
  "Use built-in CRM for organized lead management",
  "Enable Pay & Enroll where applicable",
] as const;

const missionPillars = [
  { title: "Guide Students Better", Icon: Compass },
  { title: "Make Institutes More Visible", Icon: ShieldCheck },
  { title: "Support Enrollment Growth", Icon: LineChart },
] as const;

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow ? (
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-3 text-3xl font-bold text-slate-950 sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base text-slate-600 sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function publicImageExists(src: string | null) {
  if (!src?.startsWith("/")) {
    return false;
  }

  return existsSync(path.join(process.cwd(), "public", src));
}

function ImageSlot({
  src,
  alt,
  className,
  aspectClass = "aspect-[4/3]",
}: {
  src: string | null;
  alt: string;
  className?: string;
  aspectClass?: string;
}) {
  const hasImage = publicImageExists(src);

  return (
    <div
      className={`relative overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 shadow-2xl shadow-brand-950/20 ${className ?? ""}`}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-amber-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-brand-300/25 blur-3xl" />
      <div className={`relative w-full ${aspectClass}`}>
        {hasImage && src ? (
          <Image
            src={src}
            alt={alt}
            width={900}
            height={675}
            className="h-full w-full object-cover"
            sizes="(min-width: 1024px) 45vw, 100vw"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-brand-700 via-brand-600 to-amber-400 p-8 text-center text-white">
            <div>
              <Network className="mx-auto h-12 w-12" aria-hidden="true" />
              <p className="mt-4 text-base font-semibold">
                Vidya Infinity visual coming soon
              </p>
              <p className="mt-2 text-sm text-white/80">
                Add this image in the configured public image slot.
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-gradient-to-tr from-brand-950/20 via-transparent to-amber-300/15" />
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-2xl lg:mx-0 lg:ml-auto">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-brand-600/20 via-transparent to-amber-400/25 blur-2xl" />
      <div className="absolute -inset-px rounded-[2rem] bg-gradient-to-tr from-brand-500/30 via-white/20 to-amber-300/40" />

      <div className="relative overflow-hidden rounded-[2rem] border border-brand-100/70 bg-white shadow-2xl shadow-brand-950/20">
        <div className="aspect-[4/3] w-full sm:aspect-[16/10]">
          <Image
            src={heroImage}
            alt="Vidya Infinity career guidance, course discovery, and enrollment support platform"
            width={1672}
            height={941}
            priority
            className="h-full w-full object-cover"
            sizes="(min-width: 1024px) 45vw, 100vw"
          />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-brand-950/25 via-transparent to-amber-400/10" />
      </div>

      {heroFloatingBadges.map(
        ({ eyebrow, label, status, Icon, position }, index) => (
          <div
            key={`${eyebrow}-${label}`}
            className={`pointer-events-none absolute ${position} ${
              index > 1 ? "hidden sm:flex" : "flex"
            } max-w-[9.5rem] items-center gap-2 rounded-2xl border border-white/60 bg-white/85 px-3 py-2 shadow-xl backdrop-blur-md sm:max-w-none sm:px-4 sm:py-3`}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 shadow-sm sm:h-9 sm:w-9">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-brand-700 sm:text-xs sm:tracking-[0.18em]">
                {eyebrow}
              </span>
              <span className="block text-xs font-bold leading-tight text-slate-950 sm:text-sm">
                {label}
              </span>
              <span className="hidden text-[0.68rem] font-semibold text-amber-600 sm:block">
                {status}
              </span>
            </span>
          </div>
        ),
      )}
    </div>
  );
}

function CtaLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "light";
}) {
  const classes = {
    primary:
      "bg-brand-600 text-white shadow-lg shadow-brand-900/15 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-xl",
    secondary:
      "border border-slate-200 bg-white text-slate-800 shadow-sm hover:-translate-y-0.5 hover:border-brand-200 hover:text-brand-700",
    light:
      "border border-white/40 bg-white/15 text-white backdrop-blur hover:-translate-y-0.5 hover:bg-white/25",
  }[variant];

  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition ${classes}`}
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

export default function AboutPage() {
  return (
    <main className="overflow-hidden bg-slate-50">
      <section className="relative border-b border-brand-100 bg-[radial-gradient(circle_at_top_left,#d9eeff,transparent_32%),linear-gradient(135deg,#ffffff_0%,#f8fbff_45%,#fff7ed_100%)]">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-brand-50/80 to-transparent" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-x-12 lg:gap-y-8 lg:py-24">
          <div className="max-w-3xl lg:col-start-1 lg:row-start-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white/80 px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm">
              <Sparkles className="h-4 w-4 text-amber-500" aria-hidden="true" />{" "}
              Global Education Architects
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              Connecting Students with Trusted Institutes Through Career
              Guidance, Course Discovery & Enrollment Support
            </h1>
            <p className="mt-6 max-w-3xl text-lg text-slate-600 sm:text-xl">
              Vidya Infinity helps students and parents discover the right
              educational opportunities while helping institutes become more
              visible, trusted, and accessible.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CtaLink href={ctaRoutes.exploreCourses}>Explore Courses</CtaLink>
              <CtaLink href={ctaRoutes.instituteRegister} variant="secondary">
                Register Your Institute Free
              </CtaLink>
            </div>
          </div>

          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <HeroVisual />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:col-start-1 lg:row-start-2">
            {trustBadges.map(({ title, Icon }) => (
              <div
                key={title}
                className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm transition hover:-translate-y-1 hover:border-brand-100 hover:shadow-md"
              >
                <Icon className="h-5 w-5 text-brand-600" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-slate-800">
                  {title}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <SectionHeader
          eyebrow="Why it matters"
          title="Why Vidya Infinity Matters"
        />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {problemCards.map(({ title, text, Icon }) => (
            <article
              key={title}
              className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-brand-100 hover:shadow-xl"
            >
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="mt-5 text-2xl font-bold text-slate-950">
                {title}
              </h3>
              <p className="mt-3 text-slate-600">{text}</p>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-3xl rounded-[1.5rem] border border-amber-200 bg-amber-50 px-6 py-5 text-center text-lg font-semibold text-slate-800 shadow-sm">
          Vidya Infinity bridges this gap with a structured education discovery
          and guidance ecosystem.
        </p>
      </section>

      <section className="bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeader
            eyebrow="What we do"
            title="What Vidya Infinity Does"
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {whatWeDoCards.map(({ title, text, Icon }) => (
              <article
                key={title}
                className="group rounded-[1.5rem] border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-6 shadow-sm transition duration-300 hover:-translate-y-2 hover:border-brand-200 hover:shadow-xl"
              >
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-900/10 transition group-hover:scale-110 group-hover:bg-amber-500">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-xl font-bold text-slate-950">
                  {title}
                </h3>
                <p className="mt-3 text-sm text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <SectionHeader
          eyebrow="Ecosystem"
          title="How the Vidya Infinity Ecosystem Works"
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-4">
          {ecosystemSteps.map((step, index) => (
            <article
              key={step.title}
              className="relative rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {index + 1}
              </div>
              <h3 className="text-xl font-bold text-slate-950">{step.title}</h3>
              <p className="mt-3 text-sm text-slate-600">{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-gradient-to-br from-brand-900 via-brand-700 to-brand-600 py-16 text-white lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-200">
              For Students & Parents
            </p>
            <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              Better Guidance. Better Choices. Better Futures.
            </h2>
            <p className="mt-5 text-lg text-white/80">
              Vidya Infinity helps students and parents discover trusted
              educational institutions, suitable courses, webinars, training
              programs, and career-related opportunities in one organized
              platform.
            </p>
            <ul className="mt-7 grid gap-3 sm:grid-cols-2">
              {studentBenefits.map((benefit) => (
                <li
                  key={benefit}
                  className="flex gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 text-sm font-medium text-white/90"
                >
                  <CheckCircle2
                    className="h-5 w-5 shrink-0 text-amber-300"
                    aria-hidden="true"
                  />{" "}
                  {benefit}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <CtaLink href={ctaRoutes.exploreCourses} variant="light">
                Start Exploring
              </CtaLink>
            </div>
          </div>
          <ImageSlot
            src={aboutImageSlots.studentGuidanceImage}
            alt="Students receiving career guidance through Vidya Infinity"
          />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-24">
        <ImageSlot
          src={aboutImageSlots.instituteGrowthImage}
          alt="Institute owner showcasing courses on Vidya Infinity"
        />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">
            For Institutes & Education Providers
          </p>
          <h2 className="mt-3 text-3xl font-bold text-slate-950 sm:text-4xl">
            Grow Your Visibility. Get Your Courses Discovered.
          </h2>
          <p className="mt-5 text-lg text-slate-600">
            Vidya Infinity helps academies, coaching centers, colleges,
            universities, skill centers, online education providers, and
            training institutes reach more students, generate genuine inquiries,
            and manage leads professionally.
          </p>
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            Institute registration and onboarding are currently free.
          </div>
          <ul className="mt-7 grid gap-3 sm:grid-cols-2">
            {instituteBenefits.map((benefit) => (
              <li
                key={benefit}
                className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 shadow-sm"
              >
                <CheckCircle2
                  className="h-5 w-5 shrink-0 text-brand-600"
                  aria-hidden="true"
                />{" "}
                {benefit}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <CtaLink href={ctaRoutes.instituteRegister}>
              Register Your Institute Free
            </CtaLink>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-2">
            <article className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-brand-50 to-white p-8 shadow-sm">
              <Target className="h-10 w-10 text-brand-600" aria-hidden="true" />
              <h2 className="mt-5 text-3xl font-bold text-slate-950">
                Our Mission
              </h2>
              <p className="mt-4 text-lg text-slate-700">
                Our mission is to connect students with trusted educational
                institutions through career guidance, education consulting,
                course discovery, and enrollment support.
              </p>
              <p className="mt-4 text-slate-600">
                We are committed to helping students make informed education
                decisions while helping institutes improve visibility, generate
                genuine inquiries, and manage student leads more effectively.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {missionPillars.map(({ title, Icon }) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-white bg-white/80 p-4 text-sm font-semibold text-slate-800"
                  >
                    <Icon
                      className="mb-3 h-5 w-5 text-brand-600"
                      aria-hidden="true"
                    />{" "}
                    {title}
                  </div>
                ))}
              </div>
            </article>
            <article className="rounded-[2rem] border border-slate-200 bg-slate-950 p-8 text-white shadow-sm">
              <Sparkles
                className="h-10 w-10 text-amber-300"
                aria-hidden="true"
              />
              <h2 className="mt-5 text-3xl font-bold text-white">Our Vision</h2>
              <p className="mt-4 text-lg text-white/85">
                Our vision is to become a trusted education discovery and career
                guidance ecosystem where students can confidently find the right
                learning opportunities and institutions can reach the right
                learners with clarity, credibility, and purpose.
              </p>
              <p className="mt-4 text-white/70">
                We envision a future where no genuine institute remains hidden
                due to lack of digital presence, and no student misses the right
                opportunity due to lack of proper guidance.
              </p>
              <div className="mt-6">
                <ImageSlot
                  src={aboutImageSlots.careerCounsellingImage}
                  alt="Vidya Infinity course discovery and enrollment support"
                  className="shadow-none"
                />
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:py-24">
        <div className="rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-brand-50 p-8 shadow-xl shadow-brand-900/5 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-700">
            Currently free
          </p>
          <h2 className="mt-3 text-3xl font-bold text-slate-950 sm:text-4xl">
            Free Onboarding for Institutes
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-lg text-slate-700">
            At present, registration and onboarding on Vidya Infinity are
            completely free for educational institutions. Institutes can create
            a professional profile, list courses, and start building visibility
            without any upfront onboarding cost.
          </p>
          <p className="mx-auto mt-4 max-w-3xl text-slate-600">
            If an institute does not have time to complete the setup, the Vidya
            Infinity team can assist with profile creation and course listings
            using the details, brochures, images, and course information shared
            by the institution.
          </p>
          <div className="mt-8">
            <CtaLink href={ctaRoutes.instituteRegister}>
              Onboard Your Institute
            </CtaLink>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeader
            eyebrow="Choose your journey"
            title="Built for Learners and Education Providers"
            description="A focused education platform for course discovery, guidance, visibility, inquiries, CRM-led follow-ups, and enrollment support."
          />
          <div className="mt-10">
            <AboutAudienceTabs />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:py-24">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-600">
            FAQ
          </p>
          <h2 className="mt-3 text-3xl font-bold text-slate-950 sm:text-4xl">
            Questions Institutes and Families Ask
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Clear answers about free onboarding, profile support, lead
            generation, CRM, and Pay & Enroll availability.
          </p>
        </div>
        <AboutFaq />
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:pb-24">
        <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-700 via-brand-600 to-slate-950 p-8 text-white shadow-2xl shadow-brand-900/20 sm:p-12">
          <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
              <h2 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
                Let’s Make Education More Discoverable, Guided, and Accessible
              </h2>
              <p className="mt-5 max-w-3xl text-lg text-white/80">
                Whether you are a student searching for the right direction or
                an institute ready to reach more learners, Vidya Infinity is
                built to support your journey.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <CtaLink href={ctaRoutes.exploreCourses} variant="light">
                  Explore Courses
                </CtaLink>
                <CtaLink href={ctaRoutes.instituteRegister} variant="light">
                  Register Institute Free
                </CtaLink>
                <CtaLink href={ctaRoutes.contact} variant="light">
                  Contact Vidya Infinity
                </CtaLink>
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/15 bg-white/10 p-6 backdrop-blur">
              <h3 className="text-lg font-bold text-white">
                Contact Vidya Infinity
              </h3>
              <div className="mt-4 space-y-3 text-sm text-white/80">
                <p>Website: https://vidyainfinity.com</p>
                <p>Email: infovidyainfinity@gmail.com</p>
                <p>Call/WhatsApp: +91-7828199500</p>
              </div>
              <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-amber-200">
                <MessageCircle className="h-4 w-4" aria-hidden="true" /> Vidya
                Infinity – Global Education Architects
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
