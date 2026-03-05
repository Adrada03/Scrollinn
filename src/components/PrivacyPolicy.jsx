// ─── PrivacyPolicy ──────────────────────────────────────────────────────────
// Public page, no auth required. Accessible at /privacy and /policy.
// ────────────────────────────────────────────────────────────────────────────
import { useState } from "react";

const MONO = "'ui-monospace', 'Cascadia Code', 'Source Code Pro', 'Menlo', 'Consolas', monospace";
const SANS = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const CYAN   = "#06b6d4";
const MAGENTA = "#e040fb";

// ─── Bilingual content ───────────────────────────────────────────────────────
const CONTENT = {
  en: {
    tag: "// legal document",
    subtitle: "Privacy Policy",
    updated: "Last updated: March 2026",
    sections: [
      {
        title: "1. Data We Collect",
        body: (
          <>
            <p>When you create an account in Scrollinn the following personal data is stored in our <strong style={{color:"#e5e7eb"}}>Supabase</strong> database:</p>
            <ul>
              <li><strong style={{color:"#e5e7eb"}}>Email address</strong> — used to authenticate your account and send optional service notifications.</li>
              <li><strong style={{color:"#e5e7eb"}}>Username</strong> — a display name you choose, visible on your public profile and leaderboards.</li>
              <li><strong style={{color:"#e5e7eb"}}>Game scores &amp; XP</strong> — stored to display rankings and personal statistics.</li>
            </ul>
            <p>We do <strong style={{color:"#e5e7eb"}}>not</strong> collect payment information, phone numbers, or location data.</p>
          </>
        ),
      },
      {
        title: "2. How We Use Your Data",
        body: (
          <ul>
            <li>To authenticate you and maintain your session securely via Supabase Auth.</li>
            <li>To display your username and scores on public leaderboards.</li>
            <li>To power in-game features such as daily challenges and XP rewards.</li>
            <li>We do <strong style={{color:"#e5e7eb"}}>not</strong> sell or share your data with third parties for marketing purposes.</li>
          </ul>
        ),
      },
      {
        title: "3. Cookies & Local Storage",
        body: (
          <>
            <p>
              Scrollinn uses cookies and browser local storage <strong style={{color:"#e5e7eb"}}>exclusively</strong> for session
              management through{" "}
              <a href="https://supabase.com" style={{color: CYAN, textDecoration:"underline"}} target="_blank" rel="noopener noreferrer">Supabase</a>,
              our authentication and database provider.
            </p>
            <ul>
              <li><strong style={{color:"#e5e7eb"}}>Session cookies</strong> — keep you logged in. They expire when your session ends or you log out.</li>
              <li><strong style={{color:"#e5e7eb"}}>No tracking cookies</strong> — we do not use advertising, analytics, or third-party tracking cookies.</li>
            </ul>
          </>
        ),
      },
      {
        title: "4. Data Storage & Security",
        body: (
          <p>
            All user data is stored securely in Supabase (hosted on AWS infrastructure, EU region).
            Passwords are <strong style={{color:"#e5e7eb"}}>never</strong> stored in plain text —
            authentication is handled entirely by Supabase Auth using industry-standard encryption.
          </p>
        ),
      },
      {
        title: "5. Your Rights (GDPR)",
        body: (
          <>
            <p>Under GDPR and applicable laws, you have the right to:</p>
            <ul>
              <li><strong style={{color:"#e5e7eb"}}>Access</strong> — request a copy of the personal data we hold about you.</li>
              <li><strong style={{color:"#e5e7eb"}}>Rectification</strong> — correct inaccurate data.</li>
              <li><strong style={{color:"#e5e7eb"}}>Erasure</strong> — request deletion of your account and all associated data ("right to be forgotten").</li>
              <li><strong style={{color:"#e5e7eb"}}>Portability</strong> — receive your data in a machine-readable format.</li>
              <li><strong style={{color:"#e5e7eb"}}>Object</strong> — object to the processing of your data.</li>
            </ul>
            <p>To exercise any of these rights, contact us at the address below.</p>
          </>
        ),
      },
      {
        title: "6. Contact",
        body: (
          <p>
            For any privacy-related questions or data requests, please contact:<br />
            <strong style={{color:"#e5e7eb"}}>Scrollinn</strong>&nbsp;—&nbsp;
            <a href="mailto:scrollinnapp@gmail.com" style={{color: CYAN, textDecoration:"underline"}}>
              scrollinnapp@gmail.com
            </a>
          </p>
        ),
      },
    ],
    footer: `© ${new Date().getFullYear()} Scrollinn. All rights reserved.`,
  },
  es: {
    tag: "// documento legal",
    subtitle: "Política de Privacidad",
    updated: "Última actualización: Marzo 2026",
    sections: [
      {
        title: "1. Datos que recopilamos",
        body: (
          <>
            <p>Cuando creas una cuenta en Scrollinn, los siguientes datos personales se almacenan en nuestra base de datos <strong style={{color:"#e5e7eb"}}>Supabase</strong>:</p>
            <ul>
              <li><strong style={{color:"#e5e7eb"}}>Correo electrónico</strong> — usado para autenticar tu cuenta y enviarte notificaciones opcionales del servicio.</li>
              <li><strong style={{color:"#e5e7eb"}}>Nombre de usuario</strong> — un nombre elegido por ti, visible en tu perfil público y en los marcadores.</li>
              <li><strong style={{color:"#e5e7eb"}}>Puntuaciones y XP</strong> — almacenados para mostrar clasificaciones y estadísticas personales.</li>
            </ul>
            <p><strong style={{color:"#e5e7eb"}}>No</strong> recopilamos información de pago, números de teléfono ni datos de localización.</p>
          </>
        ),
      },
      {
        title: "2. Uso de los datos",
        body: (
          <ul>
            <li>Para autenticarte y mantener tu sesión de forma segura mediante Supabase Auth.</li>
            <li>Para mostrar tu nombre de usuario y puntuaciones en los marcadores públicos.</li>
            <li>Para ofrecer funciones del juego como retos diarios y recompensas de XP.</li>
            <li><strong style={{color:"#e5e7eb"}}>No</strong> vendemos ni compartimos tus datos con terceros para fines publicitarios.</li>
          </ul>
        ),
      },
      {
        title: "3. Cookies y almacenamiento local",
        body: (
          <>
            <p>
              Scrollinn usa cookies y almacenamiento local del navegador <strong style={{color:"#e5e7eb"}}>exclusivamente</strong> para la gestión
              de sesión a través de{" "}
              <a href="https://supabase.com" style={{color: CYAN, textDecoration:"underline"}} target="_blank" rel="noopener noreferrer">Supabase</a>,
              nuestro proveedor de autenticación y base de datos.
            </p>
            <ul>
              <li><strong style={{color:"#e5e7eb"}}>Cookies de sesión</strong> — mantienen tu sesión activa. Expiran al cerrar sesión.</li>
              <li><strong style={{color:"#e5e7eb"}}>Sin cookies de rastreo</strong> — no usamos cookies publicitarias, de analítica ni de terceros.</li>
            </ul>
          </>
        ),
      },
      {
        title: "4. Almacenamiento y seguridad",
        body: (
          <p>
            Todos los datos se almacenan de forma segura en Supabase (infraestructura de AWS, región EU).
            Las contraseñas <strong style={{color:"#e5e7eb"}}>nunca</strong> se guardan en texto plano —
            la autenticación es gestionada íntegramente por Supabase Auth con cifrado estándar del sector.
          </p>
        ),
      },
      {
        title: "5. Tus derechos (RGPD)",
        body: (
          <>
            <p>Conforme al RGPD y la legislación aplicable, tienes derecho a:</p>
            <ul>
              <li><strong style={{color:"#e5e7eb"}}>Acceso</strong> — solicitar una copia de los datos que tenemos sobre ti.</li>
              <li><strong style={{color:"#e5e7eb"}}>Rectificación</strong> — corregir datos inexactos.</li>
              <li><strong style={{color:"#e5e7eb"}}>Supresión</strong> — solicitar la eliminación de tu cuenta y todos los datos asociados ("derecho al olvido").</li>
              <li><strong style={{color:"#e5e7eb"}}>Portabilidad</strong> — recibir tus datos en formato legible por máquina.</li>
              <li><strong style={{color:"#e5e7eb"}}>Oposición</strong> — oponerte al tratamiento de tus datos.</li>
            </ul>
            <p>Para ejercer cualquiera de estos derechos, contáctanos en la dirección de abajo.</p>
          </>
        ),
      },
      {
        title: "6. Contacto",
        body: (
          <p>
            Para cualquier consulta sobre privacidad o solicitud de datos:<br />
            <strong style={{color:"#e5e7eb"}}>Scrollinn</strong>&nbsp;—&nbsp;
            <a href="mailto:scrollinnapp@gmail.com" style={{color: CYAN, textDecoration:"underline"}}>
              scrollinnapp@gmail.com
            </a>
          </p>
        ),
      },
    ],
    footer: `© ${new Date().getFullYear()} Scrollinn. Todos los derechos reservados.`,
  },
};
// ─────────────────────────────────────────────────────────────────────────────

export default function PrivacyPolicy() {
  const [lang, setLang] = useState("en");
  const c = CONTENT[lang];

  return (
    /* Full-screen scrollable wrapper */
    <div
      style={{
        height: "100dvh",
        overflowY: "auto",
        backgroundColor: "#000",
        color: "#c9d1d9",
        fontFamily: SANS,
        boxSizing: "border-box",
        scrollbarWidth: "thin",
        scrollbarColor: "#1f2937 transparent",
      }}
    >
      {/* ── Lang switcher — fixed top-right ── */}
      <div
        style={{
          position: "fixed",
          top: "1.25rem",
          right: "1.25rem",
          zIndex: 50,
          display: "flex",
          gap: "0.25rem",
          backgroundColor: "rgba(0,0,0,0.75)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "8px",
          padding: "0.2rem",
        }}
      >
        {["en", "es"].map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            style={{
              fontFamily: MONO,
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "0.35rem 0.75rem",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              backgroundColor: lang === l ? CYAN : "transparent",
              color: lang === l ? "#000" : "rgba(255,255,255,0.4)",
              boxShadow: lang === l ? `0 0 12px rgba(6,182,212,0.45)` : "none",
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ── Content column ── */}
      <div
        style={{
          maxWidth: "42rem",       /* ~672px — equivalent to max-w-2xl */
          margin: "0 auto",
          padding: "4.5rem 1.75rem 6rem",
        }}
      >
        {/* ── Header ── */}
        <header style={{ marginBottom: "3rem" }}>
          <p
            style={{
              fontFamily: MONO,
              fontSize: "0.7rem",
              letterSpacing: "0.22em",
              color: CYAN,
              opacity: 0.5,
              marginBottom: "0.9rem",
              textTransform: "uppercase",
            }}
          >
            {c.tag}
          </p>

          <h1
            style={{
              fontFamily: MONO,
              fontSize: "clamp(1.8rem, 5vw, 2.6rem)",
              fontWeight: 700,
              letterSpacing: "0.18em",
              color: CYAN,
              textShadow: `0 0 20px rgba(6,182,212,0.6), 0 0 56px rgba(6,182,212,0.2)`,
              marginBottom: "0.5rem",
              lineHeight: 1.1,
            }}
          >
            SCROLLINN
          </h1>

          <h2
            style={{
              fontFamily: SANS,
              fontSize: "1.05rem",
              fontWeight: 400,
              color: "rgba(255,255,255,0.65)",
              marginBottom: "1.25rem",
              letterSpacing: "0.03em",
            }}
          >
            {c.subtitle}
          </h2>

          {/* Neon separator */}
          <div
            style={{
              height: "1px",
              background: `linear-gradient(90deg, ${CYAN}, ${MAGENTA}, transparent)`,
              opacity: 0.6,
              marginBottom: "1rem",
            }}
          />

          <p
            style={{
              fontFamily: MONO,
              fontSize: "0.75rem",
              color: "#4b5563",
              letterSpacing: "0.06em",
            }}
          >
            {c.updated}
          </p>
        </header>

        {/* ── Sections ── */}
        {c.sections.map((s, i) => (
          <div key={i}>
            <section style={{ marginBottom: "2rem" }}>
              <h3
                style={{
                  fontFamily: MONO,
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  color: MAGENTA,
                  textShadow: `0 0 10px rgba(224,64,251,0.45)`,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: "0.9rem",
                }}
              >
                {s.title}
              </h3>

              <div
                style={{
                  fontFamily: SANS,
                  fontSize: "0.9rem",
                  lineHeight: "1.85",
                  color: "#9ca3af",
                }}
              >
                {s.body}
              </div>
            </section>

            {/* gradient divider between sections (skip after last) */}
            {i < c.sections.length - 1 && (
              <div
                style={{
                  height: "1px",
                  background: `linear-gradient(90deg, transparent, ${CYAN}, ${MAGENTA}, transparent)`,
                  opacity: 0.2,
                  margin: "0 0 2rem",
                }}
              />
            )}
          </div>
        ))}

        {/* ── Footer ── */}
        <p
          style={{
            fontFamily: MONO,
            fontSize: "0.72rem",
            color: "#374151",
            textAlign: "center",
            marginTop: "3.5rem",
            letterSpacing: "0.1em",
          }}
        >
          {c.footer}
        </p>
      </div>
    </div>
  );
}

// ─── ul/li global reset for this page ────────────────────────────────────────
// (inline style on div wrapper handles scoping — no CSS file needed)
const _ulStyle = {
  paddingLeft: "1.4rem",
  margin: "0.25rem 0",
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

