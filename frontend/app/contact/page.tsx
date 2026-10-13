import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Contact us — Thread&Co",
  description: "Get in touch with the Thread&Co team — support hours Monday-Friday, 9am-6pm.",
};

export default function ContactPage() {
  return (
    <main className="store-shell">

      <section className="page-shell">
        <p className="eyebrow">GET IN TOUCH</p>
        <h1>Contact us</h1>
        <p style={{ color: "#736d65", fontSize: 13, marginBottom: 24 }}>
          Email us directly at <a href="mailto:support@threadco.example" style={{ color: "var(--accent)" }}>support@threadco.example</a>,
          or use the form below. Support hours: Monday-Friday, 9am-6pm.
        </p>
        <ContactForm />
      </section>
      <SiteFooter />
    </main>
  );
}
