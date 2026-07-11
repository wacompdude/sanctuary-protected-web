import Image from "next/image";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { LandingMotion } from "@/components/landing/landing-motion";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1438231911502-409ad9611d8e?auto=format&fit=crop&w=2400&q=80";

export function LandingPage() {
  return (
    <div className="landing-root min-h-screen bg-[var(--lp-bg)] text-[var(--lp-ink)]">
      <style>{`
        .landing-root {
          --lp-bg: #f3f5f2;
          --lp-ink: #14201c;
          --lp-muted: #4d5c56;
          --lp-forest: #1f3d34;
          --lp-sage: #6f8f7f;
          --lp-mist: #d7e0da;
          --font-display: var(--font-landing-display), Georgia, serif;
          --font-body: var(--font-landing-body), system-ui, sans-serif;
          font-family: var(--font-body);
        }
        .landing-root .font-display {
          font-family: var(--font-display);
        }
        @keyframes lp-hero-zoom {
          from { transform: scale(1.08); }
          to { transform: scale(1); }
        }
      `}</style>

      <header className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/55 to-transparent">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <BrandLogo
            href="/"
            priority
            variant="light"
            size={36}
            wordmarkClassName="font-display text-lg font-normal tracking-tight text-white drop-shadow-sm md:text-xl"
          />
          <nav className="flex items-center gap-6 text-sm text-white">
            <a
              href="#platform"
              className="hidden drop-shadow-sm hover:text-white/90 sm:inline"
            >
              Platform
            </a>
            <Link
              href="/login"
              className="rounded-md bg-white px-4 py-2 font-semibold text-[var(--lp-forest)] transition hover:bg-[var(--lp-mist)]"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative min-h-[100svh] overflow-hidden">
        <div className="absolute inset-0 animate-[lp-hero-zoom_18s_ease-out_forwards]">
          <Image
            src={HERO_IMAGE}
            alt="Sunlit sanctuary interior with wooden pews and arched windows"
            fill
            priority
            className="object-cover object-center"
            sizes="100vw"
          />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(to_top,#0d1f1a_0%,#142f27cc_42%,#0f241ecc_70%,#0a1814d9_100%)]" />

        <LandingMotion>
          <div className="relative z-10 flex min-h-[100svh] items-end px-6 pb-16 pt-28 md:pb-24">
            <div className="mx-auto w-full max-w-6xl">
              <p className="font-display text-4xl leading-none tracking-tight text-white sm:text-5xl md:text-7xl">
                Sanctuary Protected
              </p>
              <h1 className="mt-6 max-w-2xl font-display text-2xl font-medium leading-snug text-white sm:text-3xl md:text-4xl">
                Quiet strength for the places people gather to worship.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-white/95 md:text-lg">
                Give your safety team one place to report incidents, keep
                certifications current, and acknowledge device events—without
                the noise of generic security software.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/auth/sign-up"
                  className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-[var(--lp-forest)] transition hover:bg-[var(--lp-mist)]"
                >
                  Start protecting your campus
                </Link>
                <Link
                  href="/login"
                  className="rounded-md border border-white/70 bg-black/20 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-black/35"
                >
                  Sign in to your dashboard
                </Link>
              </div>
            </div>
          </div>
        </LandingMotion>
      </section>

      <section id="platform" className="px-6 py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl tracking-tight text-[var(--lp-forest)] md:text-4xl">
            Built for ministry safety teams
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[var(--lp-muted)]">
            Sanctuary Protected is designed around church operations—not
            warehouses or office parks. Your team sees what matters for this
            campus, this congregation, this week.
          </p>
        </div>
      </section>

      <section className="border-y border-[var(--lp-mist)] bg-white px-6 py-20 md:py-28">
        <div className="mx-auto grid max-w-6xl gap-16 md:grid-cols-3 md:gap-10">
          <div>
            <h3 className="font-display text-2xl text-[var(--lp-forest)]">
              Incidents
            </h3>
            <p className="mt-3 leading-relaxed text-[var(--lp-muted)]">
              Capture what happened, where, and how severe it was. Keep a clear
              timeline so leaders can follow through after the service ends.
            </p>
          </div>
          <div>
            <h3 className="font-display text-2xl text-[var(--lp-forest)]">
              Certifications
            </h3>
            <p className="mt-3 leading-relaxed text-[var(--lp-muted)]">
              Track CPR, security licenses, and training for every team member.
              Spot what is expiring before a Sunday morning surprise.
            </p>
          </div>
          <div>
            <h3 className="font-display text-2xl text-[var(--lp-forest)]">
              Events
            </h3>
            <p className="mt-3 leading-relaxed text-[var(--lp-muted)]">
              Review device alerts from cameras and sensors, then acknowledge
              them so nothing important sits unseen.
            </p>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden px-6 py-24 md:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--lp-mist),_transparent_55%),linear-gradient(180deg,_var(--lp-bg),_#e7ece8)]" />
        <div className="relative mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl tracking-tight text-[var(--lp-forest)] md:text-4xl">
            Protect the people who make your sanctuary home.
          </h2>
          <p className="mt-4 text-lg text-[var(--lp-muted)]">
            Join churches using Sanctuary Protected to stay ready, organized,
            and calm under pressure.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/auth/sign-up"
              className="rounded-md bg-[var(--lp-forest)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#163028]"
            >
              Create an account
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-[var(--lp-forest)]/25 px-5 py-3 text-sm font-semibold text-[var(--lp-forest)] transition hover:bg-white"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--lp-mist)] px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-sm text-[var(--lp-muted)] sm:flex-row sm:items-center sm:justify-between">
          <BrandLogo
            href="/"
            size={28}
            wordmarkClassName="font-display text-base font-normal text-[var(--lp-forest)]"
          />
          <p>sanctuaryprotected.com</p>
        </div>
      </footer>
    </div>
  );
}
