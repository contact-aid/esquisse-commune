type ReservationType = 'bureau' | 'salle' | 'event';

type ContactPayload = {
  company: string;
  activity: string;
  attendees: string;
  fullName: string;
  email: string;
  phone: string;
  notes: string;
};

type ReservationRequestPayload = {
  reservationType: ReservationType;
  offerLabel: string;
  requestedDate: string;
  requestedTime: string;
  contact: ContactPayload;
  roomBooking?: {
    duration: string;
    included: string;
    options: string[];
    pricing?: {
      lines: Array<{
        label: string;
        detail?: string;
        amountHt: string;
      }>;
      totalHt: string;
      vatAmount: string;
      totalTtc: string;
    };
  };
};

type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
};

const fallbackMailTo = 'lesquissecommune@gmail.com';
const fallbackMailFrom = "L'esquisse commune <no-reply@aidhabitat.fr>";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ok: false, message: 'Méthode non autorisée.'});
      return;
    }

    const payload = parsePayload(req.body);

    if (!payload) {
      res.status(400).json({ok: false, message: 'Le formulaire est incomplet ou invalide.'});
      return;
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const toAddress = process.env.RESERVATION_MAIL_TO ?? fallbackMailTo;
    const fromAddress = process.env.RESERVATION_MAIL_FROM ?? fallbackMailFrom;

    if (!resendApiKey) {
      res.status(500).json({
        ok: false,
        message: "L'envoi d'email n'est pas configuré côté serveur.",
      });
      return;
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [toAddress],
        reply_to: payload.contact.email,
        subject: buildReservationSubject(payload),
        text: buildReservationText(payload),
        html: buildReservationHtml(payload),
      }),
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.text();
      console.error('Resend error:', errorBody);
      res.status(502).json({
        ok: false,
        message: "L'email n'a pas pu être envoyé. Réessayez dans un instant.",
      });
      return;
    }

    res.status(200).json({
      ok: true,
      message: 'Votre demande a bien été envoyée.',
    });
  } catch (error) {
    console.error('Reservation function error:', error);
    res.status(500).json({
      ok: false,
      message: "Le serveur n'a pas pu traiter la demande.",
    });
  }
}

function parsePayload(body: unknown): ReservationRequestPayload | null {
  const source = parseBody(body);

  if (!source) {
    return null;
  }

  const reservationType = source.reservationType;
  const offerLabel = normalizeText(source.offerLabel);
  const requestedDate = normalizeText(source.requestedDate);
  const requestedTime = normalizeText(source.requestedTime);
  const contact = normalizeContactPayload(source.contact);
  const roomBooking = normalizeRoomBooking(source.roomBooking);

  if (
    !isReservationType(reservationType) ||
    !offerLabel ||
    !requestedDate ||
    !requestedTime ||
    (reservationType === 'salle' && !contact.company) ||
    !contact.email ||
    !contact.phone
  ) {
    return null;
  }

  if (reservationType === 'salle' && !roomBooking.duration) {
    return null;
  }

  return {
    reservationType,
    offerLabel,
    requestedDate,
    requestedTime,
    contact,
    roomBooking: reservationType === 'salle' ? roomBooking : undefined,
  };
}

function parseBody(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return isRecord(body) ? body : null;
}

function isReservationType(value: unknown): value is ReservationType {
  return value === 'bureau' || value === 'salle' || value === 'event';
}

function normalizeContactPayload(value: unknown): ContactPayload {
  const source = isRecord(value) ? value : {};

  return {
    company: normalizeText(source.company),
    activity: normalizeText(source.activity),
    attendees: normalizeText(source.attendees),
    fullName: normalizeText(source.fullName),
    email: normalizeText(source.email),
    phone: normalizeText(source.phone),
    notes: normalizeText(source.notes),
  };
}

function normalizeRoomBooking(value: unknown) {
  const source = isRecord(value) ? value : {};
  const options = Array.isArray(source.options)
    ? source.options
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const pricingSource = isRecord(source.pricing) ? source.pricing : {};
  const lines = Array.isArray(pricingSource.lines)
    ? pricingSource.lines
        .map((line) => {
          const lineSource = isRecord(line) ? line : {};

          return {
            label: normalizeText(lineSource.label),
            detail: normalizeText(lineSource.detail),
            amountHt: normalizeText(lineSource.amountHt),
          };
        })
        .filter((line) => line.label && line.amountHt)
    : [];

  return {
    duration: normalizeText(source.duration),
    included: normalizeText(source.included),
    options,
    pricing: {
      lines,
      totalHt: normalizeText(pricingSource.totalHt),
      vatAmount: normalizeText(pricingSource.vatAmount),
      totalTtc: normalizeText(pricingSource.totalTtc),
    },
  };
}

function buildReservationSubject({
  reservationType,
  offerLabel,
}: Pick<ReservationRequestPayload, 'reservationType' | 'offerLabel'>) {
  const subjectByType: Record<ReservationType, string> = {
    bureau: `Demande de visite bureau - ${offerLabel}`,
    salle: `Demande de réservation salle - ${offerLabel}`,
    event: `Demande d'événement - ${offerLabel}`,
  };

  return subjectByType[reservationType];
}

function buildReservationText({
  reservationType,
  offerLabel,
  requestedDate,
  requestedTime,
  contact,
  roomBooking,
}: ReservationRequestPayload) {
  const reservationTypeLabel: Record<ReservationType, string> = {
    bureau: 'Bureau privé',
    salle: 'Salle de réunion',
    event: "Événement d'entreprise",
  };

  const lines = [
    'Bonjour,',
    '',
    `Je souhaite faire une demande pour ${offerLabel}.`,
    '',
    `Type de demande : ${reservationTypeLabel[reservationType]}`,
    `Date souhaitée : ${requestedDate}`,
    `Email : ${contact.email}`,
    `Téléphone : ${contact.phone}`,
  ];

  if (reservationType === 'salle') {
    lines.splice(6, 0, `Créneau souhaité : ${requestedTime}`);
  } else {
    lines.splice(6, 0, `Heure souhaitée : ${requestedTime}`);
  }

  if (reservationType === 'salle' && roomBooking?.duration) {
    lines.push(`Format choisi : ${formatRoomBookingDuration(roomBooking.duration, requestedTime)}`);
  }

  if (reservationType === 'salle' && roomBooking?.options.length) {
    lines.push(`Options souhaitées : ${formatRoomOptions(roomBooking.options).join(', ')}`);
  }

  if (reservationType === 'salle' && roomBooking?.pricing?.lines.length) {
    lines.push('', 'Récapitulatif tarifaire :');

    const pricingRows = roomBooking.pricing.lines.map((line) => ({
      left: line.label,
      right: line.amountHt,
      detail: line.detail,
    }));
    const leftColumnWidth = pricingRows.reduce((max, row) => Math.max(max, row.left.length), 0);

    pricingRows.forEach((row) => {
      lines.push(`${row.left.padEnd(leftColumnWidth, ' ')}  ${row.right}`);

      if (row.detail) {
        lines.push(`${' '.repeat(leftColumnWidth)}  ${row.detail}`);
      }
    });

    if (roomBooking.pricing.totalHt) {
      lines.push(`${'Total HT'.padEnd(leftColumnWidth, ' ')}  ${roomBooking.pricing.totalHt}`);
    }

    if (roomBooking.pricing.vatAmount) {
      lines.push(`${'TVA (20 %)'.padEnd(leftColumnWidth, ' ')}  ${roomBooking.pricing.vatAmount}`);
    }

    if (roomBooking.pricing.totalTtc) {
      lines.push(`${'Total TTC'.padEnd(leftColumnWidth, ' ')}  ${roomBooking.pricing.totalTtc}`);
    }
  }

  if (contact.company) {
    lines.push(`Entreprise : ${contact.company}`);
  }

  if (contact.fullName) {
    lines.push(`Nom : ${contact.fullName}`);
  }

  if (contact.activity) {
    lines.push(`Activité / besoin : ${contact.activity}`);
  }

  if (contact.attendees) {
    lines.push(`Participants / postes : ${contact.attendees}`);
  }

  if (contact.notes) {
    lines.push(`Message : ${contact.notes}`);
  }

  lines.push('', 'Merci.');

  return lines.join('\n');
}

function buildReservationHtml(payload: ReservationRequestPayload) {
  const roomBooking = payload.roomBooking;
  const roomBookingDuration = payload.reservationType === 'salle' && roomBooking?.duration
    ? formatRoomBookingDuration(roomBooking.duration, payload.requestedTime)
    : '';
  const roomOptions = payload.reservationType === 'salle' && roomBooking?.options.length
    ? formatRoomOptions(roomBooking.options)
    : [];
  const pricingRows = payload.reservationType === 'salle' && roomBooking?.pricing?.lines.length
    ? roomBooking.pricing.lines.map((line) => `
        <tr>
          <td style="padding:8px 12px 8px 0;vertical-align:top;font-size:14px;color:#111827;">
            <div>${escapeHtml(line.label)}</div>
            ${line.detail ? `<div style="margin-top:4px;font-size:12px;color:#6b7280;">${escapeHtml(line.detail)}</div>` : ''}
          </td>
          <td style="padding:8px 0;text-align:right;vertical-align:top;font-size:14px;font-weight:600;color:#111827;white-space:nowrap;">${escapeHtml(line.amountHt)}</td>
        </tr>
      `).join('')
    : '';

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h1 style="font-size:20px;margin:0 0 16px">Nouvelle demande depuis le site</h1>
      <div style="font-size:14px;">
        <p style="margin:0 0 6px;"><strong>Type de demande :</strong> ${escapeHtml({
          bureau: 'Bureau privé',
          salle: 'Salle de réunion',
          event: "Événement d'entreprise",
        }[payload.reservationType])}</p>
        <p style="margin:0 0 6px;"><strong>Espace demandé :</strong> ${escapeHtml(payload.offerLabel)}</p>
        <p style="margin:0 0 6px;"><strong>Date souhaitée :</strong> ${escapeHtml(payload.requestedDate)}</p>
        <p style="margin:0 0 6px;"><strong>${payload.reservationType === 'salle' ? 'Créneau souhaité' : 'Heure souhaitée'} :</strong> ${escapeHtml(payload.requestedTime)}</p>
        ${roomBookingDuration ? `<p style="margin:0 0 6px;"><strong>Format choisi :</strong> ${escapeHtml(roomBookingDuration)}</p>` : ''}
        ${roomOptions.length ? `<p style="margin:0 0 6px;"><strong>Options souhaitées :</strong> ${escapeHtml(roomOptions.join(', '))}</p>` : ''}
        <p style="margin:0 0 6px;"><strong>Email :</strong> ${escapeHtml(payload.contact.email)}</p>
        <p style="margin:0 0 6px;"><strong>Téléphone :</strong> ${escapeHtml(payload.contact.phone)}</p>
        ${payload.contact.company ? `<p style="margin:0 0 6px;"><strong>Entreprise :</strong> ${escapeHtml(payload.contact.company)}</p>` : ''}
        ${payload.contact.fullName ? `<p style="margin:0 0 6px;"><strong>Nom :</strong> ${escapeHtml(payload.contact.fullName)}</p>` : ''}
        ${payload.contact.activity ? `<p style="margin:0 0 6px;"><strong>Activité / besoin :</strong> ${escapeHtml(payload.contact.activity)}</p>` : ''}
        ${payload.contact.attendees ? `<p style="margin:0 0 6px;"><strong>Participants / postes :</strong> ${escapeHtml(payload.contact.attendees)}</p>` : ''}
        ${payload.contact.notes ? `<p style="margin:0 0 6px;"><strong>Message :</strong> ${escapeHtml(payload.contact.notes)}</p>` : ''}
      </div>

      ${pricingRows ? `
        <div style="margin-top:20px;">
          <h2 style="margin:0 0 10px;font-size:16px;">Récapitulatif tarifaire</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tbody>
              ${pricingRows}
              ${roomBooking?.pricing?.totalHt ? `<tr><td style="padding:10px 12px 0 0;border-top:1px solid #e5e7eb;font-size:14px;font-weight:700;">Total HT</td><td style="padding:10px 0 0;border-top:1px solid #e5e7eb;text-align:right;font-size:14px;font-weight:700;white-space:nowrap;">${escapeHtml(roomBooking.pricing.totalHt)}</td></tr>` : ''}
              ${roomBooking?.pricing?.vatAmount ? `<tr><td style="padding:8px 12px 0 0;font-size:14px;font-weight:600;">TVA (20 %)</td><td style="padding:8px 0 0;text-align:right;font-size:14px;font-weight:600;white-space:nowrap;">${escapeHtml(roomBooking.pricing.vatAmount)}</td></tr>` : ''}
              ${roomBooking?.pricing?.totalTtc ? `<tr><td style="padding:10px 12px 0 0;border-top:1px solid #e5e7eb;font-size:15px;font-weight:700;">Total TTC</td><td style="padding:10px 0 0;border-top:1px solid #e5e7eb;text-align:right;font-size:15px;font-weight:700;white-space:nowrap;">${escapeHtml(roomBooking.pricing.totalTtc)}</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      ` : ''}
    </div>
  `.trim();
}

function formatRoomBookingDuration(duration: string, requestedTime: string) {
  const cleanDuration = duration.split(' - ')[0]?.trim() ?? '';

  if (!cleanDuration) {
    return '';
  }

  if (cleanDuration.toLowerCase().includes('demi-journ')) {
    return `${cleanDuration} ${requestedTime}`.trim();
  }

  return cleanDuration;
}

function formatRoomOptions(options: string[]) {
  return options.map((option) => option.split(' : ')[0]?.trim() ?? option).filter(Boolean);
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
