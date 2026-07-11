import type { Metadata } from "next";
import { Fraunces, Figtree } from "next/font/google";
import { LandingPage } from "@/components/landing/landing-page";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-landing-display",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-landing-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sanctuary Protected | Security for Houses of Worship",
  description:
    "Sanctuary Protected helps churches and ministries manage incidents, certifications, and device events—so your team can protect the people who gather.",
  openGraph: {
    title: "Sanctuary Protected",
    description:
      "Incident response, certification tracking, and event awareness built for sanctuary teams.",
    url: "https://sanctuaryprotected.com",
    siteName: "Sanctuary Protected",
    type: "website",
  },
};

export default function Home() {
  return (
    <div className={`${fraunces.variable} ${figtree.variable}`}>
      <LandingPage />
    </div>
  );
}
