import { Fragment } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface BookingEmailProps {
  preview: string;
  heading: string;
  intro: string;
  /** Label/value pairs, e.g. ["When", "Tuesday, …"]. */
  rows: [string, string][];
  buttons?: { label: string; href: string }[];
  hostName: string;
  logoUrl?: string | null;
  footer?: string;
}

/**
 * The one layout behind every booking email. Plain and light on markup on purpose: simple
 * content is kinder to spam filters (PRD §11) and readable on any client.
 */
export function BookingEmail({
  preview,
  heading,
  intro,
  rows,
  buttons = [],
  hostName,
  logoUrl,
  footer,
}: BookingEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          {logoUrl ? (
            <Img src={logoUrl} alt={hostName} height={40} style={{ marginBottom: 16 }} />
          ) : (
            <Text style={brand}>{hostName}</Text>
          )}
          <Heading as="h1" style={h1}>
            {heading}
          </Heading>
          <Text style={text}>{intro}</Text>
          <Section style={details}>
            {rows.map(([label, value]) => (
              <Text key={label} style={row}>
                <span style={rowLabel}>{label}</span>
                <br />
                {/^https?:\/\//.test(value) ? <Link href={value}>{value}</Link> : value}
              </Text>
            ))}
          </Section>
          {buttons.length > 0 && (
            <Section style={{ marginTop: 8 }}>
              {buttons.map((b, i) => (
                <Fragment key={b.label}>
                  {i > 0 && " "}
                  <Button href={b.href} style={i === 0 ? primaryButton : secondaryButton}>
                    {b.label}
                  </Button>
                </Fragment>
              ))}
            </Section>
          )}
          <Hr style={hr} />
          <Text style={muted}>{footer ?? "Sent by Slotwise on behalf of " + hostName + "."}</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#f6f7f9",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: "24px 0",
};
const container = {
  backgroundColor: "#ffffff",
  borderRadius: 12,
  margin: "0 auto",
  maxWidth: 520,
  padding: "32px 28px",
};
const brand = { color: "#1d4ed8", fontSize: 14, fontWeight: 600, margin: "0 0 16px" };
const h1 = { color: "#111827", fontSize: 22, margin: "0 0 12px" };
const text = { color: "#374151", fontSize: 15, lineHeight: "22px", margin: "0 0 16px" };
const details = { backgroundColor: "#f9fafb", borderRadius: 8, padding: "4px 16px" };
const row = { color: "#111827", fontSize: 14, lineHeight: "20px", margin: "12px 0" };
const rowLabel = { color: "#6b7280", fontSize: 12, textTransform: "uppercase" as const };
const buttonBase = {
  borderRadius: 6,
  display: "inline-block",
  fontSize: 14,
  fontWeight: 600,
  marginRight: 8,
  marginTop: 16,
  padding: "10px 16px",
  textDecoration: "none",
};
const primaryButton = { ...buttonBase, backgroundColor: "#1d4ed8", color: "#ffffff" };
const secondaryButton = {
  ...buttonBase,
  backgroundColor: "#ffffff",
  border: "1px solid #d1d5db",
  color: "#111827",
};
const hr = { borderColor: "#e5e7eb", margin: "24px 0 12px" };
const muted = { color: "#6b7280", fontSize: 12, lineHeight: "18px", margin: 0 };
