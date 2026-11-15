"use client";

import { useState } from "react";
import { saveCustomerPhone } from "@/lib/actions/customers";
import { whatsappLink, whatsappNumber } from "@/lib/whatsapp";

type Labels = {
  title: string;
  hint: string;
  afterPayment: string;
  phone: string;
  phoneHint: string;
  invalidPhone: string;
  saveNumber: string;
  language: string;
  message: string;
  open: string;
};

/**
 * "Send invoice on WhatsApp": the customer's number (editable, optionally saved back to the
 * customer), the message in Arabic or English (editable), and a button that opens WhatsApp ready
 * to send. Nothing is sent until the staff member presses Send in WhatsApp.
 */
export function WhatsAppSend({
  lang,
  customerId,
  phone: savedPhone,
  messages,
  defaultLanguage,
  canSavePhone,
  highlight,
  labels,
}: {
  lang: string;
  customerId: string;
  phone: string;
  messages: { en: string; ar: string };
  defaultLanguage: "en" | "ar";
  canSavePhone: boolean;
  highlight: boolean;
  labels: Labels;
}) {
  const [phone, setPhone] = useState(savedPhone);
  const [language, setLanguage] = useState(defaultLanguage);
  const [message, setMessage] = useState(messages[defaultLanguage]);
  const [save, setSave] = useState(true);
  const number = whatsappNumber(phone);
  const changed = phone.trim() !== savedPhone.trim();

  const switchLanguage = (next: "en" | "ar") => {
    // Swap the text only if it hasn't been edited, so edits aren't lost.
    if (message === messages[language]) setMessage(messages[next]);
    setLanguage(next);
  };

  const onOpen = () => {
    if (changed && save && canSavePhone) {
      const fd = new FormData();
      fd.set("lang", lang);
      fd.set("id", customerId);
      fd.set("phone", phone);
      void saveCustomerPhone(fd);
    }
  };

  return (
    <section className={`card card-pad ${highlight ? "ring-2 ring-emerald-500" : ""}`}>
      <h2 className="section-title flex items-center gap-2">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-emerald-600">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
        </svg>
        {labels.title}
      </h2>
      <p className="hint mb-4">{highlight ? labels.afterPayment : labels.hint}</p>
      <div className="space-y-4">
        <div>
          <label htmlFor="wa-phone" className="label">
            {labels.phone}
          </label>
          <input
            id="wa-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            dir="ltr"
            className="input"
            aria-invalid={!number}
            aria-describedby="wa-phone-hint"
          />
          <p id="wa-phone-hint" className={`mt-1 text-xs ${number ? "text-muted" : "text-red-700"}`}>
            {number ? `${labels.phoneHint} +${number}` : labels.invalidPhone}
          </p>
          {changed && canSavePhone && (
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="size-4 accent-brand-600" />
              {labels.saveNumber}
            </label>
          )}
        </div>
        <div>
          <span className="label">{labels.language}</span>
          <div className="flex gap-2" role="radiogroup" aria-label={labels.language}>
            {(["ar", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={language === l}
                onClick={() => switchLanguage(l)}
                className={language === l ? "btn-primary min-h-9 px-4 text-sm" : "btn-secondary min-h-9 px-4 text-sm"}
              >
                {l === "ar" ? "العربية" : "English"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="wa-message" className="label">
            {labels.message}
          </label>
          <textarea
            id="wa-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            dir={language === "ar" ? "rtl" : "ltr"}
            className="input min-h-40 text-sm leading-relaxed"
          />
        </div>
        <a
          href={number ? whatsappLink(number, message) : undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpen}
          aria-disabled={!number}
          className={`btn-primary w-full !bg-emerald-600 hover:!bg-emerald-700 ${number ? "" : "pointer-events-none opacity-50"}`}
        >
          {labels.open}
        </a>
      </div>
    </section>
  );
}
