import {
  ArrowRight,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Coffee,
  Mail,
  MessageSquare,
  Phone,
  User,
  Users,
} from 'lucide-react';
import {AnimatePresence, motion} from 'motion/react';
import type {FormEvent, ReactNode} from 'react';
import {useEffect, useRef, useState} from 'react';
import {DayPicker} from 'react-day-picker';
import {format} from 'date-fns';
import {fr} from 'date-fns/locale';
import {desks} from '../data/desks';
import {rooms} from '../data/rooms';
import {siteConfig} from '../data/site';
import {trackEvent} from '../lib/analytics';
import {
  getAvailableRoomOptions,
  getRoomBookingMode,
  type HalfDaySlot,
  type ContactPayload,
  type ReservationType,
  type RoomBookingMode,
} from '../lib/reservation';

type EventFormatId = 'atelier' | 'teamday' | 'afterwork';

export type ReservationPrefill =
  | {
      reservationType: ReservationType;
      deskId?: string;
      roomId?: string;
      eventFormatId?: EventFormatId;
      roomBookingMode?: RoomBookingMode;
      selectedRoomOptions?: string[];
    }
  | null;

const eventFormats: Array<{
  id: EventFormatId;
  title: string;
  description: string;
}> = [
  {
    id: 'atelier',
    title: 'Atelier ou formation',
    description: 'Pour réunir une équipe, un comité ou un groupe projet sur un format cadré.',
  },
  {
    id: 'teamday',
    title: "Journée d'équipe",
    description: 'Pour mixer temps de travail, pauses et moments plus informels dans les espaces communs.',
  },
  {
    id: 'afterwork',
    title: 'Afterwork ou lancement',
    description: 'Pour recevoir des invités dans un cadre professionnel, flexible et convivial.',
  },
];

const timeSlots = Array.from({length: 18}, (_, index) => {
  const hour = 9 + Math.floor(index / 2);
  const minutes = index % 2 === 0 ? '00' : '30';
  return `${hour.toString().padStart(2, '0')}:${minutes}`;
});

const roomAttendeeOptions = Array.from({length: 8}, (_, index) => `${index + 1}`);
const isEventReservationAvailable = false;
const minHourlyRoomSlots = 2;
const maxHourlyRoomSlots = 6;

const initialContactState: ContactPayload = {
  company: '',
  activity: '',
  attendees: '',
  fullName: '',
  email: '',
  phone: '',
  notes: '',
};

function getRoomScheduleLabel({
  mode,
  startTime,
  endTime,
  halfDaySlot,
}: {
  mode: RoomBookingMode | null;
  startTime: string;
  endTime: string;
  halfDaySlot: HalfDaySlot | null;
}) {
  if (mode === 'hourly') {
    return startTime && endTime ? `De ${startTime} à ${endTime}` : '';
  }

  if (mode === 'halfday') {
    if (halfDaySlot === 'morning') {
      return 'Matin';
    }

    if (halfDaySlot === 'afternoon') {
      return 'Après-midi';
    }

    return '';
  }

  if (mode === 'day') {
    return 'Journée complète';
  }

  return '';
}

function parseEuroAmount(value: string) {
  const normalized = value.replace(',', '.');
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function formatEuroAmount(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

export function ReservationForm({prefill}: {prefill: ReservationPrefill}) {
  const [formStep, setFormStep] = useState(1);
  const [isDesktop, setIsDesktop] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : false));
  const [reservationType, setReservationType] = useState<ReservationType | null>('bureau');
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedEventFormatId, setSelectedEventFormatId] = useState<EventFormatId | null>(null);
  const [resDate, setResDate] = useState<Date | undefined>();
  const [resTime, setResTime] = useState('');
  const [roomBookingMode, setRoomBookingMode] = useState<RoomBookingMode | null>(null);
  const [roomStartTime, setRoomStartTime] = useState('');
  const [roomEndTime, setRoomEndTime] = useState('');
  const [roomHalfDaySlot, setRoomHalfDaySlot] = useState<HalfDaySlot | null>(null);
  const [selectedRoomOptions, setSelectedRoomOptions] = useState<string[]>([]);
  const [breakfastChoice, setBreakfastChoice] = useState<'selected' | 'declined' | null>(null);
  const [dayOptionsChoice, setDayOptionsChoice] = useState(false);
  const [contact, setContact] = useState<ContactPayload>(initialContactState);
  const [showMobileRoomContactStep, setShowMobileRoomContactStep] = useState(false);
  const [submitState, setSubmitState] = useState<{
    status: 'idle' | 'submitting' | 'success' | 'error';
    message: string;
  }>({
    status: 'idle',
    message: '',
  });
  const formContainerRef = useRef<HTMLDivElement | null>(null);
  const previousStepRef = useRef(formStep);
  const previousMobileContactStepRef = useRef(showMobileRoomContactStep);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    trackEvent('view_reservation_form');
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const syncViewport = (event?: MediaQueryListEvent) => {
      setIsDesktop(event ? event.matches : mediaQuery.matches);
    };

    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);

    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    if (!prefill) {
      return;
    }

    const normalizedReservationType = prefill.reservationType === 'event' && !isEventReservationAvailable
      ? 'bureau'
      : prefill.reservationType;
    const prefilledRoom = prefill.roomId ? rooms.find((room) => room.id === prefill.roomId) ?? null : null;
    const allowedPrefillOptions = getAvailableRoomOptions({
      allOptions: prefilledRoom?.options ?? [],
      mode: prefill.roomBookingMode ?? null,
      halfDaySlot: null,
    });

    setReservationType(normalizedReservationType);
    setSelectedDeskId(normalizedReservationType === 'bureau' ? prefill.deskId ?? null : null);
    setSelectedRoomId(normalizedReservationType === 'salle' ? prefill.roomId ?? null : null);
    setSelectedEventFormatId(normalizedReservationType === 'event' ? prefill.eventFormatId ?? null : null);
    setResDate(undefined);
    setResTime('');
    setRoomBookingMode(normalizedReservationType === 'salle' ? prefill.roomBookingMode ?? null : null);
    setRoomStartTime('');
    setRoomEndTime('');
    setRoomHalfDaySlot(null);
    setSelectedRoomOptions(normalizedReservationType === 'salle'
      ? (prefill.selectedRoomOptions ?? []).filter((option) => allowedPrefillOptions.includes(option))
      : []);
    setBreakfastChoice(
      normalizedReservationType === 'salle' && (prefill.selectedRoomOptions ?? []).some((option) => option.toLowerCase().includes('petit déjeuner'))
        ? 'selected'
        : null,
    );
    setSubmitState({status: 'idle', message: ''});
    setDayOptionsChoice(false);

    if (normalizedReservationType === 'bureau' && prefill.deskId) {
      setFormStep(3);
    } else if (normalizedReservationType === 'salle' && prefill.roomId) {
      setFormStep(3);
    } else if (normalizedReservationType === 'event' && prefill.eventFormatId) {
      setFormStep(3);
    } else {
      setFormStep(2);
    }
  }, [prefill]);

  const selectedDesk = desks.find((desk) => desk.id === selectedDeskId) ?? null;
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const selectedEventFormat = eventFormats.find((item) => item.id === selectedEventFormatId) ?? null;
  const selectedRoomRate = selectedRoom?.rates?.find((rate) => getRoomBookingMode(rate.label) === roomBookingMode) ?? null;
  const roomScheduleLabel = getRoomScheduleLabel({
    mode: roomBookingMode,
    startTime: roomStartTime,
    endTime: roomEndTime,
    halfDaySlot: roomHalfDaySlot,
  });
  const selectedRoomDurationLabel = selectedRoomRate ? `${selectedRoomRate.label} - ${selectedRoomRate.price}` : '';
  const selectedRoomPriceLabel = selectedRoomRate ? `Location ${selectedRoomRate.label.toLowerCase()}` : 'Réservation';
  const selectedRoomIncluded = selectedRoomRate?.details ?? (roomBookingMode === 'hourly' ? 'Avec espace café' : '');
  const selectedRoomOptionsSummary = selectedRoomOptions.map((option) => {
    const [optionTitle] = option.split(' : ');
    const attendeeCount = contact.attendees.trim();
    const attendeeLabel = attendeeCount
      ? `${attendeeCount} ${attendeeCount === '1' ? 'personne' : 'personnes'}`
      : 'Nombre de personnes a preciser';

    return {
      option,
      title: optionTitle,
      attendeeLabel,
    };
  });
  const availableRoomOptions = getAvailableRoomOptions({
    allOptions: selectedRoom?.options ?? [],
    mode: roomBookingMode,
    halfDaySlot: roomHalfDaySlot,
    startTime: roomStartTime,
  });
  const roomAttendeesReady = selectedRoomOptions.length === 0 || contact.attendees.trim().length > 0;
  const roomStartIndex = roomStartTime ? timeSlots.indexOf(roomStartTime) : -1;
  const roomEndIndex = roomEndTime ? timeSlots.indexOf(roomEndTime) : -1;
  const roomScheduleReady =
    !!resDate &&
    (roomBookingMode === 'hourly'
      ? !!roomStartTime &&
        !!roomEndTime &&
        roomStartIndex >= 0 &&
        roomEndIndex >= 0 &&
        roomEndIndex - roomStartIndex >= minHourlyRoomSlots &&
        roomEndIndex - roomStartIndex <= maxHourlyRoomSlots
      : roomBookingMode === 'halfday'
        ? roomHalfDaySlot !== null
        : roomBookingMode === 'day');
  const roomReservationTypeReady = !!resDate && !!roomBookingMode;
  const roomSelectionReady =
    !!resDate &&
    (reservationType !== 'salle'
      ? !!resTime
      : roomScheduleReady);
  const roomDetailsLocked = reservationType === 'salle' && !roomScheduleReady;
  const halfDayPreviewOption =
    selectedRoom?.options?.find((option) => option.toLowerCase().includes('petit déjeuner')) ??
    'Petit déjeuner : 5€ HT par personne';
  const [halfDayPreviewTitle, halfDayPreviewPrice] = halfDayPreviewOption.split(' : ');
  const breakfastOptionAvailable = availableRoomOptions.some((option) => option.toLowerCase().includes('petit déjeuner'));
  const breakfastSelected = selectedRoomOptions.includes(halfDayPreviewOption);
  const requiresBreakfastDecision =
    reservationType === 'salle' &&
    (
      (roomBookingMode === 'halfday' && roomHalfDaySlot === 'morning' && breakfastOptionAvailable) ||
      (roomBookingMode === 'hourly' && breakfastOptionAvailable)
    );
  const breakfastDecisionReady = !requiresBreakfastDecision || breakfastChoice !== null;
  const showDisabledHalfDayBreakfastOption =
    reservationType === 'salle' &&
    roomBookingMode === 'halfday' &&
    roomHalfDaySlot === 'afternoon';
  const roomAttendeeCount = Number(contact.attendees.trim() || '0');
  const selectedRoomRateAmount = parseEuroAmount(selectedRoomRate?.price ?? '');
  const roomDurationSlotCount =
    roomBookingMode === 'hourly' && roomStartTime && roomEndTime
      ? Math.max(timeSlots.indexOf(roomEndTime) - timeSlots.indexOf(roomStartTime), 0)
      : 0;
  const roomDurationHours = roomDurationSlotCount / 2;
  const roomBasePrice =
    reservationType === 'salle' && selectedRoomRate
      ? roomBookingMode === 'hourly'
        ? selectedRoomRateAmount * roomDurationHours
        : selectedRoomRateAmount
      : 0;
  const selectedRoomPriceLines = selectedRoomOptions.map((option) => {
    const [title, priceDetails = ''] = option.split(' : ');
    const unitPrice = parseEuroAmount(priceDetails);
    const isPerPerson = /par personne/i.test(priceDetails);
    const quantity = isPerPerson ? roomAttendeeCount : 1;
    const total = unitPrice * quantity;

    return {
      option,
      title,
      unitPrice,
      quantity,
      total,
      unitLabel: isPerPerson ? `${quantity} ${quantity > 1 ? 'personnes' : 'personne'}` : null,
    };
  });
  const selectedRoomTotalHt = roomBasePrice + selectedRoomPriceLines.reduce((sum, line) => sum + line.total, 0);
  const selectedRoomVatAmount = selectedRoomTotalHt * 0.2;
  const selectedRoomTotalTtc = selectedRoomTotalHt + selectedRoomVatAmount;

  useEffect(() => {
    setSelectedRoomOptions((current) => {
      const next = current.filter((option) => availableRoomOptions.includes(option));
      return next.length === current.length ? current : next;
    });
  }, [availableRoomOptions]);

  useEffect(() => {
    if (roomBookingMode !== 'day' || selectedRoomOptions.length > 0) {
      setDayOptionsChoice(false);
    }
  }, [roomBookingMode, selectedRoomOptions]);

  useEffect(() => {
    if (!requiresBreakfastDecision) {
      if (breakfastChoice !== null) {
        setBreakfastChoice(null);
      }

      return;
    }

    const hasBreakfastSelected = selectedRoomOptions.includes(halfDayPreviewOption);
    const nextChoice = hasBreakfastSelected ? 'selected' : breakfastChoice === 'declined' ? 'declined' : null;

    if (nextChoice !== breakfastChoice) {
      setBreakfastChoice(nextChoice);
    }
  }, [breakfastChoice, halfDayPreviewOption, requiresBreakfastDecision, selectedRoomOptions]);

  useEffect(() => {
    if (reservationType === 'salle' && formStep === 5 && !isDesktop) {
      setShowMobileRoomContactStep(false);
    }
  }, [formStep, isDesktop, reservationType]);

  useEffect(() => {
    const movedForward = formStep > previousStepRef.current;
    const enteredMobileContactStep = showMobileRoomContactStep && !previousMobileContactStepRef.current;

    previousStepRef.current = formStep;
    previousMobileContactStepRef.current = showMobileRoomContactStep;

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (isDesktop || (!movedForward && !enteredMobileContactStep)) {
      return;
    }

    let frameOne = 0;
    let frameTwo = 0;

    frameOne = window.requestAnimationFrame(() => {
      frameTwo = window.requestAnimationFrame(() => {
        formContainerRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
    };
  }, [formStep, isDesktop, showMobileRoomContactStep]);

  const selectedOfferLabel =
    reservationType === 'bureau'
      ? selectedDesk?.name ?? 'Bureau privé'
      : reservationType === 'salle'
        ? selectedRoom?.name ?? 'Salle de réunion'
        : selectedEventFormat?.title ?? "Événement d'entreprise";
  const selectedOfferImage =
    reservationType === 'bureau'
      ? selectedDesk?.image ?? '/desks/bureau-6-1.jpg'
      : reservationType === 'salle'
        ? selectedRoom?.image ?? '/rooms/la-place-1.jpg'
        : '/gallery/salon-4.jpg';
  const selectedOfferMeta =
    reservationType === 'bureau' && selectedDesk
      ? `${selectedDesk.capacity} • ${selectedDesk.size} • ${selectedDesk.price} • ${selectedDesk.orientation}`
      : reservationType === 'salle' && selectedRoom
        ? selectedRoomDurationLabel
          ? `${selectedRoom.features[0]} • ${selectedRoomDurationLabel}`
          : `${selectedRoom.features[0]}`
        : null;
  const totalSteps = reservationType === 'salle' ? 5 : 4;
  const isWideStep =
    (reservationType === 'salle' && formStep === 4) ||
    (reservationType === 'salle' && formStep === 5) ||
    (reservationType !== 'salle' && formStep === 4);
  const isMobileRoomContactFlow = reservationType === 'salle' && !isDesktop;

  const submitLabel =
    reservationType === 'bureau'
      ? 'Demander une visite du bureau'
      : reservationType === 'salle'
        ? 'Envoyer la demande de salle'
        : "Préparer la demande d'événement";

  const notesPlaceholder =
    reservationType === 'bureau'
      ? 'Précisez la date d’installation souhaitée, le nombre de postes, la durée visée ou toute information utile.'
      : reservationType === 'salle'
        ? 'Décrivez votre réunion, le format souhaité ou toute précision utile.'
        : 'Décrivez votre événement, la jauge, les espaces souhaités ou toute précision utile.';

  const handleTypeSelect = (type: ReservationType) => {
    if (type === 'event' && !isEventReservationAvailable) {
      return;
    }

    trackEvent('select_reservation_type', {reservation_type: type});

    setReservationType(type);
    setSelectedDeskId(null);
    setSelectedRoomId(null);
    setSelectedEventFormatId(null);
    setResDate(undefined);
    setResTime('');
    setRoomBookingMode(null);
    setRoomStartTime('');
    setRoomEndTime('');
    setRoomHalfDaySlot(null);
    setSelectedRoomOptions([]);
    setSubmitState({status: 'idle', message: ''});

    if (isDesktop) {
      setFormStep(2);
    }
  };

  const resetForm = () => {
    setFormStep(1);
    setReservationType('bureau');
    setSelectedDeskId(null);
    setSelectedRoomId(null);
    setSelectedEventFormatId(null);
    setResDate(undefined);
    setResTime('');
    setRoomBookingMode(null);
    setRoomStartTime('');
    setRoomEndTime('');
    setRoomHalfDaySlot(null);
    setSelectedRoomOptions([]);
    setContact(initialContactState);
    setSubmitState({status: 'idle', message: ''});
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!reservationType || !resDate || !roomSelectionReady) {
      return;
    }

    if (reservationType === 'salle' && !selectedRoomDurationLabel) {
      setSubmitState({
        status: 'error',
        message: 'Complétez le format de réservation de la salle.',
      });
      return;
    }

    setSubmitState({status: 'submitting', message: ''});

    try {
      const response = await fetch('/api/reservation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reservationType,
          offerLabel: selectedOfferLabel,
          requestedDate: format(resDate, 'EEEE d MMMM yyyy', {locale: fr}),
          requestedTime: reservationType === 'salle' ? roomScheduleLabel : resTime,
          contact,
          roomBooking: reservationType === 'salle'
            ? {
                duration: selectedRoomDurationLabel,
                included: selectedRoomIncluded,
                options: selectedRoomOptions,
                pricing: {
                  lines: [
                    {
                      label:
                        `${selectedRoomPriceLabel}` +
                        (roomBookingMode === 'halfday' && roomHalfDaySlot
                          ? ` (${roomHalfDaySlot === 'morning' ? 'matin' : 'après-midi'})`
                          : '') +
                        (roomBookingMode === 'hourly' && roomDurationHours > 0
                          ? ` (${formatEuroAmount(roomDurationHours)} h)`
                          : ''),
                      amountHt: `${formatEuroAmount(roomBasePrice)} € HT`,
                    },
                    ...selectedRoomPriceLines.map(({title, unitPrice, unitLabel, total}) => ({
                      label: title,
                      detail: unitLabel ? `(${formatEuroAmount(unitPrice)} € x ${unitLabel})` : '',
                      amountHt: `${formatEuroAmount(total)} € HT`,
                    })),
                  ],
                  totalHt: `${formatEuroAmount(selectedRoomTotalHt)} € HT`,
                  vatAmount: `${formatEuroAmount(selectedRoomVatAmount)} €`,
                  totalTtc: `${formatEuroAmount(selectedRoomTotalTtc)} € TTC`,
                },
              }
            : undefined,
        }),
      });

      if (!response.headers.get('content-type')?.includes('application/json')) {
        setSubmitState({
          status: 'error',
          message: `Le service d'envoi est indisponible. Contactez-nous à ${siteConfig.email}.`,
        });
        return;
      }

      const result = await response.json() as {ok?: boolean; message?: string};

      if (!response.ok || !result.ok) {
        setSubmitState({
          status: 'error',
          message: result.message ?? "L'envoi a échoué. Réessayez dans un instant.",
        });
        return;
      }

      setSubmitState({
        status: 'success',
        message: result.message ?? 'Votre demande a bien été envoyée.',
      });
      trackEvent('generate_lead', {
        lead_type: reservationType,
        offer_name: selectedOfferLabel,
        booking_mode: roomBookingMode ?? 'visit',
        currency: 'EUR',
        value: reservationType === 'salle' ? selectedRoomTotalTtc : undefined,
      });
    } catch {
      setSubmitState({
        status: 'error',
        message: "L'envoi a échoué. Vérifiez votre connexion puis réessayez.",
      });
    }
  };

  const downloadCalendarInvite = () => {
    if (!resDate) {
      return;
    }

    const eventStart = new Date(resDate);
    const eventEnd = new Date(resDate);

    if (reservationType === 'bureau') {
      const [hours, minutes] = resTime.split(':').map((value) => Number(value));
      eventStart.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
      eventEnd.setHours(eventStart.getHours() + 1, eventStart.getMinutes(), 0, 0);
    } else if (reservationType === 'salle' && roomBookingMode === 'hourly' && roomStartTime && roomEndTime) {
      const [startHours, startMinutes] = roomStartTime.split(':').map((value) => Number(value));
      const [endHours, endMinutes] = roomEndTime.split(':').map((value) => Number(value));
      eventStart.setHours(Number.isFinite(startHours) ? startHours : 9, Number.isFinite(startMinutes) ? startMinutes : 0, 0, 0);
      eventEnd.setHours(Number.isFinite(endHours) ? endHours : eventStart.getHours() + 1, Number.isFinite(endMinutes) ? endMinutes : 0, 0, 0);
    } else if (reservationType === 'salle' && roomBookingMode === 'halfday') {
      if (roomHalfDaySlot === 'afternoon') {
        eventStart.setHours(14, 0, 0, 0);
        eventEnd.setHours(18, 0, 0, 0);
      } else {
        eventStart.setHours(9, 0, 0, 0);
        eventEnd.setHours(13, 0, 0, 0);
      }
    } else {
      eventStart.setHours(9, 0, 0, 0);
      eventEnd.setHours(18, 0, 0, 0);
    }

    const formatIcsDate = (date: Date) =>
      `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}00Z`;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//L-esquisse commune//Reservation//FR',
      'BEGIN:VEVENT',
      `UID:${Date.now()}@esquisse.aidhabitat.fr`,
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART:${formatIcsDate(eventStart)}`,
      `DTEND:${formatIcsDate(eventEnd)}`,
      `SUMMARY:${selectedOfferLabel}`,
      `DESCRIPTION:${submitState.message || 'Demande bien envoyée.'}`,
      `LOCATION:${siteConfig.address.street}, ${siteConfig.address.postalCode} ${siteConfig.address.city}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');

    const blob = new Blob([icsContent], {type: 'text/calendar;charset=utf-8'});
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = 'rendez-vous-esquisse-commune.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  const returnToTop = () => {
    resetForm();
    document.getElementById('hero')?.scrollIntoView({behavior: 'smooth', block: 'start'});
  };

  return (
    <div
      ref={formContainerRef}
      style={{scrollMarginTop: '108px'}}
      className={`mx-auto w-full rounded-3xl bg-[#F4F4F5] p-4 shadow-2xl transition-[max-width] duration-300 ease-out sm:p-6 md:p-8 ${
        isWideStep ? 'max-w-6xl' : 'max-w-2xl'
      }`}
    >
      <AnimatePresence mode="wait">
        {formStep === 1 && (
          <motion.div
            key="step-1"
            initial={{opacity: 0, x: 20}}
            animate={{opacity: 1, x: 0}}
            exit={{opacity: 0, x: -20}}
            transition={{duration: 0.25}}
            className="w-full"
          >
            <StepFrame>
              <div className="mb-6">
                <h3 className="text-base font-bold text-gray-900">Choisissez votre demande</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  Sélectionnez le type d’espace que vous souhaitez nous envoyer.
                </p>
              </div>

              <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <OfferButton
                  active={reservationType === 'bureau'}
                  image="/desks/bureau-6-1.jpg"
                  title="Bureaux privés"
                  description="Location mensuelle avec engagement d’un an renouvelable."
                  onClick={() => handleTypeSelect('bureau')}
                />
                <OfferButton
                  active={reservationType === 'salle'}
                  image="/rooms/la-place-1.jpg"
                  title="Salle de réunion"
                  description="Réservation à l’heure pour vos rendez-vous, ateliers et comités."
                  onClick={() => handleTypeSelect('salle')}
                />
              </div>

              <button
                type="button"
                disabled={!reservationType}
                onClick={() => setFormStep(2)}
                className="mb-8 w-full rounded-xl bg-primary py-4 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 lg:hidden"
              >
                Continuer
              </button>

              <Progress step={1} totalSteps={totalSteps} />
            </StepFrame>
          </motion.div>
        )}

        {formStep === 2 && reservationType === 'bureau' && (
          <SelectionStep
            title="2. Choix du bureau"
            totalSteps={totalSteps}
            onBack={() => setFormStep(1)}
            items={desks.map((desk) => ({
              id: desk.id,
              title: desk.name,
              subtitleLines: [
                `${desk.size} • ${desk.orientation}`,
                desk.capacity,
                desk.price,
              ],
              icon: <Building2 size={20} />,
              image: desk.image,
              disabled: !desk.available,
            }))}
            selectedId={selectedDeskId}
            onSelect={(id) => {
              setSelectedDeskId(id);
              if (isDesktop) {
                setFormStep(3);
              }
            }}
            onContinue={() => setFormStep(3)}
            showContinue={!isDesktop}
          />
        )}

        {formStep === 2 && reservationType === 'salle' && (
          <SelectionStep
            title="2. Choix de la salle"
            totalSteps={totalSteps}
            onBack={() => setFormStep(1)}
            items={rooms.map((room) => ({
              id: room.id,
              title: room.name,
              subtitle: `${room.features[0]} • ${room.priceHour} HT / heure`,
              icon: <Users size={20} />,
              image: room.image,
              disabled: !room.available,
            }))}
            selectedId={selectedRoomId}
            onSelect={(id) => {
              setSelectedRoomId(id);
              setRoomBookingMode(null);
              setRoomStartTime('');
              setRoomEndTime('');
              setRoomHalfDaySlot(null);
              setSelectedRoomOptions([]);
              if (isDesktop) {
                setFormStep(3);
              }
            }}
            onContinue={() => setFormStep(3)}
            showContinue={!isDesktop}
          />
        )}

        {formStep === 2 && reservationType === 'event' && (
          <SelectionStep
            title="2. Format de votre événement"
            totalSteps={totalSteps}
            onBack={() => setFormStep(1)}
            items={eventFormats.map((item) => ({
              id: item.id,
              title: item.title,
              subtitle: item.description,
              icon: <CalendarDays size={20} />,
            }))}
            selectedId={selectedEventFormatId}
            onSelect={(id) => {
              setSelectedEventFormatId(id as EventFormatId);
              if (isDesktop) {
                setFormStep(3);
              }
            }}
            onContinue={() => setFormStep(3)}
            showContinue={!isDesktop}
          />
        )}

        {formStep === 3 && reservationType && (
          <motion.div
            key="step-3"
            initial={{opacity: 0, x: 20}}
            animate={{opacity: 1, x: 0}}
            exit={{opacity: 0, x: -20}}
            transition={{duration: 0.25}}
            className="w-full"
          >
            <StepFrame>
              <div className="mb-6 flex items-center gap-3">
                <button type="button" onClick={() => setFormStep(2)} className="text-gray-400 transition-colors hover:text-black" aria-label="Revenir à l'étape précédente">
                  <ArrowRight size={16} className="rotate-180" />
                </button>
                <h3 className="text-sm font-bold text-gray-900">
                  {reservationType === 'salle' ? '3. Date et type de réservation' : '3. Date et créneau souhaités'}
                </h3>
              </div>

            <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl sm:h-20 sm:w-20">
                  <img
                    src={selectedOfferImage}
                    alt={selectedOfferLabel}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Sélection actuelle</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{selectedOfferLabel}</p>
                  {selectedOfferMeta ? (
                    <p className="mt-2 text-sm text-gray-600">{selectedOfferMeta}</p>
                  ) : null}
                </div>
              </div>
            </div>

            {!resDate ? (
              <div className="mb-6 w-full rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
                <DayPicker
                  mode="single"
                  selected={resDate}
                  onSelect={setResDate}
                  locale={fr}
                  disabled={[{dayOfWeek: [0, 6]}, {before: new Date()}]}
                  className="!m-0 w-full"
                  components={{
                    Chevron: ({orientation, className}) =>
                      orientation === 'left' ? (
                        <ChevronLeft size={16} className={className} />
                      ) : (
                        <ChevronRight size={16} className={className} />
                      ),
                  }}
                  classNames={{
                    root: 'w-full',
                    months: 'w-full',
                    month: 'w-full space-y-4',
                    month_caption: 'mb-3 flex items-center justify-center gap-3 pt-1',
                    caption_label: 'text-base font-bold capitalize text-gray-900',
                    nav: 'flex items-center gap-2',
                    button_previous:
                      'inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 transition-colors hover:border-primary hover:bg-primary hover:text-white',
                    button_next:
                      'inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 transition-colors hover:border-primary hover:bg-primary hover:text-white',
                    month_grid: 'w-full table-fixed border-collapse',
                    weekdays: 'grid grid-cols-7 gap-2',
                    weekday: 'pb-2 text-center text-[0.8rem] font-semibold text-gray-500',
                    weeks: 'space-y-2',
                    week: 'grid grid-cols-7 gap-2',
                    day: 'w-full',
                    day_button:
                      'flex h-11 w-full items-center justify-center rounded-lg text-sm font-medium text-gray-900 transition-colors hover:bg-primary hover:text-white disabled:hover:bg-transparent disabled:hover:text-gray-400 aria-selected:opacity-100',
                    selected: 'bg-primary font-bold text-white hover:bg-primary hover:text-white focus:bg-primary focus:text-white',
                    today: 'rounded-lg bg-gray-100 text-gray-900 hover:bg-primary hover:text-white',
                    outside: 'text-gray-400 opacity-50',
                    disabled: 'text-gray-400 opacity-50',
                    hidden: 'invisible',
                  }}
                />
              </div>
            ) : (
              <motion.div
                initial={{opacity: 0, scale: 0.95}}
                animate={{opacity: 1, scale: 1}}
                className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
              >
                <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Date sélectionnée</h4>
                    <p className="font-medium text-primary">{format(resDate, 'EEEE d MMMM yyyy', {locale: fr})}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setResDate(undefined);
                      setResTime('');
                      setRoomBookingMode(null);
                      setRoomStartTime('');
                      setRoomEndTime('');
                      setRoomHalfDaySlot(null);
                      setSelectedRoomOptions([]);
                    }}
                    className="text-xs font-bold text-gray-500 underline underline-offset-4 transition-colors hover:text-primary"
                  >
                    Modifier
                  </button>
                </div>

                {reservationType === 'salle' && selectedRoom ? (
                  <div className="space-y-5">
                    <div>
                      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Type de réservation</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {(selectedRoom.rates ?? []).map((rate) => {
                          const mode = getRoomBookingMode(rate.label);
                          if (!mode) {
                            return null;
                          }

                          const isActive = roomBookingMode === mode;

                          return (
                            <button
                              key={`${selectedRoom.id}-${rate.label}`}
                              type="button"
                              onClick={() => {
                                setRoomBookingMode(mode);
                                setRoomStartTime('');
                                setRoomEndTime('');
                                setRoomHalfDaySlot(null);
                              }}
                              className={`flex h-full flex-col rounded-xl border p-4 text-left transition-all ${
                                isActive
                                  ? 'border-primary bg-primary text-white shadow-md'
                                  : 'border-gray-200 bg-gray-50 text-gray-900 hover:border-primary/40 hover:bg-white'
                              }`}
                            >
                              <div className="min-h-[2.75rem]">
                                <p className="text-sm font-bold leading-snug">{rate.label}</p>
                              </div>
                              <p className={`mt-1 text-lg font-black ${isActive ? 'text-white' : 'text-gray-900'}`}>{rate.price}</p>
                              <p className={`mt-2 min-h-[2.5rem] text-xs leading-relaxed ${isActive ? 'text-white/75' : 'text-gray-500'}`}>
                                {rate.details ?? 'Avec espace café'}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                ) : (
                  <>
                    <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-gray-500">Choisissez une heure</h4>
                    <div className="grid max-h-60 grid-cols-3 gap-3 overflow-y-auto pr-2 custom-scrollbar sm:grid-cols-4">
                      {timeSlots.map((time) => (
                        <button
                          key={time}
                          type="button"
                          onClick={() => {
                            setResTime(time);
                            if (isDesktop) {
                              setFormStep(4);
                            }
                          }}
                          className={`rounded-xl border py-3 text-sm font-medium transition-all ${
                            resTime === time
                              ? 'scale-105 border-primary bg-primary text-white shadow-md'
                              : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-primary/50 hover:bg-white'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </motion.div>
            )}

            <button
              type="button"
              disabled={reservationType === 'salle' ? !roomReservationTypeReady : !roomSelectionReady}
              onClick={() => setFormStep(4)}
              className={`w-full rounded-xl bg-primary py-4 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 ${
                reservationType === 'salle' ? '' : 'lg:hidden'
              }`}
            >
              Continuer
            </button>

              <div className="mt-8">
                <Progress step={3} totalSteps={totalSteps} />
              </div>
            </StepFrame>
          </motion.div>
        )}

        {formStep === 4 && reservationType === 'salle' && resDate && roomReservationTypeReady && (
          <motion.div
            key="step-4-room-details"
            initial={{opacity: 0, x: 20}}
            animate={{opacity: 1, x: 0}}
            exit={{opacity: 0, x: -20}}
            transition={{duration: 0.25}}
            className="w-full"
          >
            <StepFrame wide>
              <div className="mb-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormStep(3)}
                  className="text-gray-400 transition-colors hover:text-black"
                  aria-label="Revenir à l'étape précédente"
                >
                  <ArrowRight size={16} className="rotate-180" />
                </button>
                <h3 className="text-sm font-bold text-gray-900">4. Créneau et détails de la réunion</h3>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="hidden h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:flex">
                  <div className="mb-4 flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={18} />
                    <div>
                      <p className="text-sm font-bold text-gray-900">Récapitulatif de la demande</p>
                    </div>
                  </div>

                  {selectedRoom ? (
                    <div className="mb-4 flex items-start gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl">
                        <img
                          src={selectedRoom.image}
                          alt={selectedRoom.name}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Réservation</p>
                        <p className="mt-2 text-base font-bold text-gray-900">
                          {selectedRoom.name}{resDate ? ` le ${format(resDate, 'dd MMMM yyyy', {locale: fr})}` : ''}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-gray-500">{selectedRoom.description}</p>
                        {selectedRoomIncluded ? (
                          <p className="mt-2 text-sm font-semibold text-gray-900">{selectedRoomIncluded}</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Prix estimatif</p>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-baseline justify-between gap-3 text-sm font-semibold text-gray-900">
                        <span>
                          {selectedRoomPriceLabel}
                          {roomBookingMode === 'hourly' && roomDurationHours > 0 ? ` (${formatEuroAmount(roomDurationHours)} h)` : ''}
                        </span>
                        <span>{formatEuroAmount(roomBasePrice)} € HT</span>
                      </div>

                      {selectedRoomPriceLines.map(({option, title, unitPrice, total, unitLabel}) => (
                        <div
                          key={`step-4-price-${option}`}
                          className="flex items-baseline justify-between gap-3 text-sm font-semibold text-gray-900"
                        >
                          <span>
                            {title}
                            {unitLabel ? ` (${formatEuroAmount(unitPrice)} € x ${unitLabel})` : ''}
                          </span>
                          <span>{formatEuroAmount(total)} € HT</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-gray-200 pt-3">
                      <span className="text-sm font-bold text-gray-900">Total HT</span>
                      <span className="text-base font-bold text-primary">{formatEuroAmount(selectedRoomTotalHt)} € HT</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {roomBookingMode === 'hourly' ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <div>
                        <h4 className="text-base font-bold text-gray-900">Choisissez votre plage horaire</h4>
                        <p className="mt-1 text-sm leading-relaxed text-gray-500">
                          Sélectionnez une heure de début puis une heure de fin, pour une durée comprise entre 1h et 3h.
                        </p>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor="room-start-time" className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                            De
                          </label>
                          <select
                            id="room-start-time"
                            value={roomStartTime}
                            onChange={(event) => {
                              const nextStartTime = event.target.value;
                              const nextStartIndex = timeSlots.indexOf(nextStartTime);
                              setRoomStartTime(nextStartTime);
                              if (
                                roomEndTime &&
                                (
                                  timeSlots.indexOf(roomEndTime) - nextStartIndex < minHourlyRoomSlots ||
                                  timeSlots.indexOf(roomEndTime) - nextStartIndex > maxHourlyRoomSlots
                                )
                              ) {
                                setRoomEndTime('');
                              }
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="">Choisir l’heure de début</option>
                            {timeSlots.slice(0, -minHourlyRoomSlots).map((time) => (
                              <option key={`start-${time}`} value={time}>{time}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="room-end-time" className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                            À
                          </label>
                          <select
                            id="room-end-time"
                            value={roomEndTime}
                            onChange={(event) => setRoomEndTime(event.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="">Choisir l’heure de fin</option>
                            {timeSlots.filter((time) => {
                              if (!roomStartTime) {
                                return false;
                              }

                              const slotDistance = timeSlots.indexOf(time) - roomStartIndex;
                              return slotDistance >= minHourlyRoomSlots && slotDistance <= maxHourlyRoomSlots;
                            }).map((time) => (
                              <option key={`end-${time}`} value={time}>{time}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {roomBookingMode === 'halfday' ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <div>
                        <h4 className="text-base font-bold text-gray-900">Choisissez votre créneau</h4>
                        <p className="mt-1 text-sm leading-relaxed text-gray-500">
                          La demi-journée se précise ensuite entre matin et après-midi.
                        </p>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setRoomHalfDaySlot('morning')}
                          className={`rounded-xl border p-4 text-left transition-all ${
                            roomHalfDaySlot === 'morning'
                              ? 'border-primary bg-primary text-white shadow-md'
                              : 'border-gray-200 bg-white text-gray-900 hover:border-primary/40'
                          }`}
                        >
                          <p className="text-sm font-bold">Matin</p>
                          <p className={`mt-2 text-xs leading-relaxed ${roomHalfDaySlot === 'morning' ? 'text-white/75' : 'text-gray-500'}`}>
                            Compatible avec l’option petit déjeuner.
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoomHalfDaySlot('afternoon')}
                          className={`rounded-xl border p-4 text-left transition-all ${
                            roomHalfDaySlot === 'afternoon'
                              ? 'border-primary bg-primary text-white shadow-md'
                              : 'border-gray-200 bg-white text-gray-900 hover:border-primary/40'
                          }`}
                        >
                          <p className="text-sm font-bold">Après-midi</p>
                          <p className={`mt-2 text-xs leading-relaxed ${roomHalfDaySlot === 'afternoon' ? 'text-white/75' : 'text-gray-500'}`}>
                            Format simple avec la formule demi-journée.
                          </p>
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div>
                      <h4 className="text-base font-bold text-gray-900">Détails de la réunion</h4>
                      <p className="mt-1 text-sm leading-relaxed text-gray-500">
                        {roomDetailsLocked
                          ? 'Sélectionnez d’abord un créneau pour activer les options et le nombre de personnes.'
                          : 'Sélectionnez vos options si besoin, puis continuez vers l’étape des coordonnées.'}
                      </p>
                    </div>

                    {roomBookingMode === 'halfday' && roomDetailsLocked ? (
                      <div className="grid grid-cols-1 gap-3 opacity-55 sm:grid-cols-2">
                        <div className="flex min-h-[108px] flex-col justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                          <div className="flex items-start gap-3">
                            <Coffee size={16} className="text-primary" />
                            <div>
                              <p className="text-sm font-bold text-gray-900">{halfDayPreviewOption.split(' : ')[0]}</p>
                              <p className="mt-1 text-xs font-medium text-gray-500">{halfDayPreviewOption.split(' : ')[1] ?? ''}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex min-h-[108px] flex-col justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                          <div className="flex items-start gap-3">
                            <Users size={16} className="text-primary" />
                            <div>
                              <p className="text-sm font-bold text-gray-900">Nombre de personnes</p>
                            </div>
                          </div>
                          <div className="mt-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-400">
                            Choisir
                          </div>
                        </div>
                      </div>
                    ) : showDisabledHalfDayBreakfastOption ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex min-h-[108px] flex-col justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 opacity-55">
                          <div className="flex items-start gap-3">
                            <Coffee size={16} className="text-primary" />
                            <div>
                              <p className="text-sm font-bold text-gray-900">{halfDayPreviewTitle}</p>
                              {halfDayPreviewPrice ? (
                                <p className="mt-1 text-xs font-medium text-gray-500">{halfDayPreviewPrice}</p>
                              ) : null}
                              <p className="mt-2 text-xs font-medium text-gray-400">
                                Non disponible pour une demi-journée après-midi.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex min-h-[108px] flex-col justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                          <div className="flex items-start gap-3">
                            <Users size={16} className="text-primary" />
                            <div>
                              <p className="text-sm font-bold text-gray-900">Nombre de personnes</p>
                            </div>
                          </div>
                          <select
                            id="meeting-attendees"
                            value={contact.attendees}
                            onChange={(event) => setContact((current) => ({...current, attendees: event.target.value}))}
                            className="mt-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="">Choisir</option>
                            {roomAttendeeOptions.map((count) => (
                              <option key={`meeting-attendees-${count}`} value={count}>
                                {count}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : roomBookingMode === 'halfday' && availableRoomOptions.length > 0 ? (
                      <>
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                            <div className="flex min-h-[108px] flex-col justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 lg:order-2">
                              <div className="flex items-start gap-3">
                                <Users size={16} className="text-primary" />
                                <div>
                                  <p className="text-sm font-bold text-gray-900">Nombre de personnes</p>
                                </div>
                              </div>
                              <select
                                id="meeting-attendees"
                                value={contact.attendees}
                                onChange={(event) => setContact((current) => ({...current, attendees: event.target.value}))}
                                className="mt-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                required={selectedRoomOptions.length > 0}
                              >
                                <option value="">Choisir</option>
                                {roomAttendeeOptions.map((count) => (
                                  <option key={`meeting-attendees-${count}`} value={count}>
                                    {count}
                                  </option>
                                ))}
                              </select>
                            </div>

                          <button
                            type="button"
                            disabled={breakfastChoice === 'declined'}
                            onClick={() => {
                              const nextSelected = !breakfastSelected;
                              setBreakfastChoice(nextSelected ? 'selected' : null);
                              setSelectedRoomOptions(nextSelected ? [halfDayPreviewOption] : []);
                            }}
                            className={`min-h-[108px] rounded-xl border px-4 py-3 text-left text-sm transition-colors lg:order-1 ${
                                breakfastChoice === 'declined'
                                ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 opacity-55'
                                : breakfastSelected
                                  ? 'border-primary bg-primary text-white shadow-md'
                                : 'border-gray-200 bg-gray-50 text-gray-900 hover:border-primary/30 hover:bg-white'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <Coffee size={16} className={breakfastSelected ? 'text-white' : 'text-primary'} />
                                <div className="min-w-0 flex-1">
                                  <p className={`font-bold ${
                                    breakfastChoice === 'declined' ? 'text-gray-400' : breakfastSelected ? 'text-white' : 'text-gray-900'
                                  }`}>{halfDayPreviewTitle}</p>
                                  {halfDayPreviewPrice ? (
                                    <p className={`mt-0.5 text-xs font-medium ${
                                    breakfastChoice === 'declined' ? 'text-gray-400' : breakfastSelected ? 'text-white/80' : 'text-gray-500'
                                  }`}>
                                      {halfDayPreviewPrice}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </button>
                          </div>

                          {breakfastOptionAvailable ? (
                            <button
                              type="button"
                              onClick={() => {
                                const nextDeclined = breakfastChoice !== 'declined';
                                setBreakfastChoice(nextDeclined ? 'declined' : null);
                                setSelectedRoomOptions([]);
                              }}
                              className={`flex w-full items-center gap-2 rounded-xl px-1 py-2 text-left text-xs font-medium transition-colors ${
                                breakfastChoice === 'declined'
                                  ? 'text-primary'
                                  : 'text-gray-500 hover:text-gray-700'
                              }`}
                            >
                              <span className={`flex h-4 w-4 shrink-0 rounded-[4px] border ${
                                breakfastChoice === 'declined'
                                  ? 'border-primary bg-primary'
                                  : 'border-gray-300 bg-white'
                              }`} />
                              Je ne souhaite pas prendre d&apos;option petit déjeuner
                            </button>
                          ) : null}

                        </div>
                      </>
                    ) : roomBookingMode === 'hourly' ? (
                      <>
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                            {roomDetailsLocked ? (
                              <div className="flex min-h-[108px] flex-col justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 lg:order-2">
                                <div className="flex items-start gap-3">
                                  <Users size={16} className="text-primary" />
                                  <div>
                                    <p className="text-sm font-bold text-gray-900">Nombre de personnes</p>
                                  </div>
                                </div>
                                <div className="mt-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-400">
                                  Choisir
                                </div>
                              </div>
                            ) : (
                              <div className="flex min-h-[108px] flex-col justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 lg:order-2">
                                <div className="flex items-start gap-3">
                                  <Users size={16} className="text-primary" />
                                  <div>
                                    <p className="text-sm font-bold text-gray-900">Nombre de personnes</p>
                                  </div>
                                </div>
                                <select
                                  id="meeting-attendees"
                                  value={contact.attendees}
                                  onChange={(event) => setContact((current) => ({...current, attendees: event.target.value}))}
                                  className="mt-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                  required={selectedRoomOptions.length > 0}
                                >
                                  <option value="">Choisir</option>
                                  {roomAttendeeOptions.map((count) => (
                                    <option key={`meeting-attendees-hourly-${count}`} value={count}>
                                      {count}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <button
                              type="button"
                              disabled={breakfastChoice === 'declined' || !breakfastOptionAvailable}
                              onClick={() => {
                                if (!breakfastOptionAvailable) {
                                  return;
                                }

                                const nextSelected = !breakfastSelected;
                                setBreakfastChoice(nextSelected ? 'selected' : null);
                                setSelectedRoomOptions(nextSelected ? [halfDayPreviewOption] : []);
                              }}
                              className={`min-h-[108px] rounded-xl border px-4 py-3 text-left text-sm transition-colors lg:order-1 ${
                                breakfastChoice === 'declined'
                                  ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 opacity-55'
                                : !breakfastOptionAvailable
                                  ? 'border-gray-200 bg-gray-50 text-gray-900 opacity-55'
                                : breakfastSelected
                                    ? 'border-primary bg-primary text-white shadow-md'
                                  : 'border-gray-200 bg-gray-50 text-gray-900 hover:border-primary/30 hover:bg-white'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <Coffee
                                  size={16}
                                  className={
                                    breakfastChoice === 'declined'
                                      ? 'text-gray-400'
                                      : breakfastOptionAvailable && breakfastSelected
                                      ? 'text-white'
                                      : 'text-primary'
                                  }
                                />
                                <div>
                                  <p className={`text-sm font-bold ${
                                    breakfastChoice === 'declined'
                                      ? 'text-gray-400'
                                      : breakfastOptionAvailable && breakfastSelected
                                      ? 'text-white'
                                    : 'text-gray-900'
                                  }`}>
                                    {halfDayPreviewTitle}
                                  </p>
                                  {halfDayPreviewPrice ? (
                                    <p className={`mt-0.5 text-xs font-medium ${
                                      breakfastChoice === 'declined'
                                        ? 'text-gray-400'
                                        : breakfastOptionAvailable && breakfastSelected
                                        ? 'text-white/80'
                                        : 'text-gray-500'
                                    }`}>
                                      {halfDayPreviewPrice}
                                    </p>
                                  ) : null}
                                  {!breakfastOptionAvailable ? (
                                    roomStartTime ? (
                                      <p className="mt-2 text-xs font-medium text-gray-400">
                                        Disponible uniquement pour un début entre 9h et 11h.
                                      </p>
                                    ) : null
                                  ) : null}
                                </div>
                              </div>
                            </button>
                          </div>

                          {breakfastOptionAvailable ? (
                            <button
                              type="button"
                              onClick={() => {
                                const nextDeclined = breakfastChoice !== 'declined';
                                setBreakfastChoice(nextDeclined ? 'declined' : null);
                                setSelectedRoomOptions([]);
                              }}
                              className={`flex w-full items-center gap-2 rounded-xl px-1 py-2 text-left text-xs font-medium transition-colors ${
                                breakfastChoice === 'declined'
                                  ? 'text-primary'
                                  : 'text-gray-500 hover:text-gray-700'
                              }`}
                            >
                              <span className={`flex h-4 w-4 shrink-0 rounded-[4px] border ${
                                breakfastChoice === 'declined'
                                  ? 'border-primary bg-primary'
                                  : 'border-gray-300 bg-white'
                              }`} />
                              Je ne souhaite pas prendre d&apos;option petit déjeuner
                            </button>
                          ) : null}

                        </div>
                      </>
                    ) : (
                      <div className={roomDetailsLocked ? 'pointer-events-none opacity-55' : ''}>
                        {availableRoomOptions.length > 0 ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {availableRoomOptions.map((option) => {
                                const checked = selectedRoomOptions.includes(option);
                                const [optionTitle, optionPrice] = option.split(' : ');
                                const isDayWithoutOptions = roomBookingMode === 'day' && dayOptionsChoice;

                                return (
                                  <button
                                    key={option}
                                    type="button"
                                    disabled={isDayWithoutOptions}
                                    onClick={() => {
                                    setSelectedRoomOptions((current) =>
                                      checked ? current.filter((item) => item !== option) : [...current, option],
                                    );
                                    setDayOptionsChoice(false);
                                  }}
                                    className={`rounded-xl border px-4 py-4 text-left text-sm transition-colors ${
                                      isDayWithoutOptions
                                        ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 opacity-55'
                                        :
                                      checked
                                        ? 'border-primary bg-primary text-white shadow-md'
                                        : 'border-gray-200 bg-gray-50 text-gray-900 hover:border-primary/30 hover:bg-white'
                                    }`}
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span className={`block font-bold ${
                                        isDayWithoutOptions ? 'text-gray-400' : checked ? 'text-white' : 'text-gray-900'
                                      }`}>{optionTitle}</span>
                                      {optionPrice ? (
                                        <span className={`mt-0.5 block text-xs font-medium ${
                                          isDayWithoutOptions ? 'text-gray-400' : checked ? 'text-white/80' : 'text-gray-500'
                                        }`}>{optionPrice}</span>
                                      ) : null}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            {roomBookingMode === 'day' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setDayOptionsChoice((current) => {
                                    const nextValue = !current;

                                    if (nextValue) {
                                      setSelectedRoomOptions([]);
                                    }

                                    return nextValue;
                                  });
                                }}
                                className={`flex w-full items-center gap-2 rounded-xl px-1 py-2 text-left text-xs font-medium transition-colors ${
                                  dayOptionsChoice
                                    ? 'text-primary'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                <span className={`flex h-4 w-4 shrink-0 rounded-[4px] border ${
                                  dayOptionsChoice
                                    ? 'border-primary bg-primary'
                                    : 'border-gray-300 bg-white'
                                }`} />
                                Je continue sans prendre d&apos;option
                              </button>
                            ) : null}
                          </div>
                        ) : null}

                        <div className={availableRoomOptions.length > 0 ? (roomBookingMode === 'day' ? 'pt-4' : 'pt-1') : ''}>
                          <RoomAttendeesSelect
                            id="meeting-attendees"
                            label="Nombre de personnes"
                            value={contact.attendees}
                            onChange={(value) => setContact((current) => ({...current, attendees: value}))}
                            required={selectedRoomOptions.length > 0}
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={!roomSelectionReady || !roomAttendeesReady || !breakfastDecisionReady}
                      onClick={() => {
                        setSubmitState({status: 'idle', message: ''});
                        setFormStep(5);
                      }}
                      className="w-full rounded-xl bg-primary py-4 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Valider et continuer
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <Progress step={4} totalSteps={totalSteps} />
              </div>
            </StepFrame>
          </motion.div>
        )}

        {((formStep === 4 && reservationType && reservationType !== 'salle' && resDate && !!resTime) ||
          (formStep === 5 && reservationType === 'salle' && resDate && roomSelectionReady)) && (
          <motion.div
            key={reservationType === 'salle' ? 'step-5-room-contact' : 'step-4-contact'}
            initial={{opacity: 0, x: 20}}
            animate={{opacity: 1, x: 0}}
            exit={{opacity: 0, x: -20}}
            transition={{duration: 0.25}}
            className="w-full"
          >
            <StepFrame wide={isWideStep}>
              <div className="mb-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (reservationType === 'salle' && !isDesktop && showMobileRoomContactStep) {
                      setShowMobileRoomContactStep(false);
                      return;
                    }

                    setFormStep(reservationType === 'salle' ? 4 : 3);
                  }}
                  className="text-gray-400 transition-colors hover:text-black"
                  aria-label="Revenir à l'étape précédente"
                >
                  <ArrowRight size={16} className="rotate-180" />
                </button>
                <h3 className="text-sm font-bold text-gray-900">
                  {reservationType === 'salle' ? '5. Vos informations' : '4. Vos informations'}
                </h3>
              </div>

            {submitState.status === 'success' ? (
              <div className="flex flex-col items-center py-8 text-center">
                <motion.div
                  initial={{opacity: 0, scale: 0.7, rotate: -10}}
                  animate={{opacity: 1, scale: 1, rotate: 0}}
                  transition={{duration: 0.35, ease: 'easeOut'}}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <CheckCircle2 size={32} strokeWidth={2.4} />
                </motion.div>

                <motion.div
                  initial={{opacity: 0, y: 12}}
                  animate={{opacity: 1, y: 0}}
                  transition={{duration: 0.3, delay: 0.08, ease: 'easeOut'}}
                  className="mt-5"
                >
                  <p className="text-2xl font-bold text-primary">Demande bien envoyée</p>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-500">
                    Nous revenons vers vous rapidement pour confirmer votre demande et organiser la suite.
                  </p>
                </motion.div>

                <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={downloadCalendarInvite}
                    className="rounded-xl border border-primary/20 bg-white px-5 py-4 text-sm font-bold text-primary transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    Ajouter à mon agenda
                  </button>
                  <button
                    type="button"
                    onClick={returnToTop}
                    className="rounded-xl bg-primary px-5 py-4 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary/90"
                  >
                    Retourner à l&apos;accueil
                  </button>
                </div>
              </div>
            ) : (
              <form className="space-y-3" onSubmit={handleSubmit}>
                {submitState.status === 'error' && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {submitState.message}
                  </div>
                )}

                <div className={`grid grid-cols-1 gap-4 ${isMobileRoomContactFlow ? '' : 'xl:grid-cols-[0.95fr_1.05fr]'}`}>
                  <motion.div
                    initial={false}
                    animate={isMobileRoomContactFlow
                      ? {
                          opacity: showMobileRoomContactStep ? 0 : 1,
                          x: showMobileRoomContactStep ? -20 : 0,
                          height: showMobileRoomContactStep ? 0 : 'auto',
                        }
                      : {
                          opacity: 1,
                          x: 0,
                          height: 'auto',
                        }}
                    transition={{duration: 0.25}}
                    className={`flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${
                      isMobileRoomContactFlow ? 'overflow-hidden' : 'h-full'
                    } ${isMobileRoomContactFlow && showMobileRoomContactStep ? 'pointer-events-none border-transparent p-0 shadow-none' : ''}`}
                    aria-hidden={isMobileRoomContactFlow && showMobileRoomContactStep}
                  >
                    <div className="mb-4 flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={18} />
                      <div>
                        <p className="text-sm font-bold text-gray-900">Récapitulatif de la demande</p>
                        <p className="mt-1 text-xs leading-relaxed text-gray-500">
                          Vérifiez les informations ci-dessous avant l’envoi.
                        </p>
                      </div>
                    </div>

                    {reservationType === 'salle' && selectedRoom ? (
                      <div className="mb-4 flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-start">
                        <div className="h-48 w-full shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-28">
                          <img
                            src={selectedRoom.image}
                            alt={selectedRoom.name}
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Réservation</p>
                        <p className="mt-2 text-base font-bold text-gray-900">
                          {selectedRoom.name}{resDate ? ` le ${format(resDate, 'dd MMMM yyyy', {locale: fr})}` : ''}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-gray-500">{selectedRoom.description}</p>
                        {selectedRoomIncluded ? (
                          <p className="mt-2 text-sm font-semibold text-gray-900">{selectedRoomIncluded}</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                    {reservationType === 'bureau' && selectedDesk ? (
                      <div className="mb-4 flex items-start gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl">
                          <img
                            src={selectedDesk.image}
                            alt={selectedDesk.name}
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Bureau sélectionné</p>
                          <p className="mt-2 text-base font-bold text-gray-900">{selectedDesk.name}</p>
                          <p className="mt-1 text-sm leading-relaxed text-gray-500">
                            {selectedDesk.size} • {selectedDesk.capacity} • {selectedDesk.price} HT • {selectedDesk.orientation}
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-gray-500">
                            Espaces partagés • Salles de réunion
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-gray-500">
                            Charges comprises dans le prix.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {reservationType !== 'salle' ? (
                      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 content-start">
                        <>
                          <SummaryCard label="Date souhaitée" value={format(resDate, 'dd MMMM yyyy', {locale: fr})} />
                          <SummaryCard label="Horaire souhaité" value={resTime} />
                        </>
                      </div>
                    ) : null}

                    {reservationType === 'salle' ? (
                  <div className="mt-3 space-y-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Prix estimatif</p>
                          <div className="mt-3 space-y-2">
                            <div className="flex items-start justify-between gap-3 text-sm font-semibold text-gray-900">
                              <span className="min-w-0 flex-1">
                                {selectedRoomPriceLabel}
                                {roomBookingMode === 'halfday' && roomHalfDaySlot ? ` (${roomHalfDaySlot === 'morning' ? 'matin' : 'après-midi'})` : ''}
                                {roomBookingMode === 'hourly' && roomDurationHours > 0 ? ` (${formatEuroAmount(roomDurationHours)} h)` : ''}
                              </span>
                              <span className="shrink-0 whitespace-nowrap text-right">{formatEuroAmount(roomBasePrice)} € HT</span>
                            </div>

                            {selectedRoomPriceLines.map(({option, title, unitPrice, quantity, total, unitLabel}) => (
                              <div
                                key={`price-${option}`}
                                className="flex items-start justify-between gap-3 text-sm font-semibold text-gray-900"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block">{title}</span>
                                  {unitLabel ? (
                                    <span className="mt-1 block text-xs font-medium leading-relaxed text-gray-500">
                                      ({formatEuroAmount(unitPrice)} € x {unitLabel})
                                    </span>
                                  ) : null}
                                </span>
                                <span className="shrink-0 whitespace-nowrap text-right">{formatEuroAmount(total)} € HT</span>
                              </div>
                            ))}
                          </div>

                          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-gray-200 pt-3">
                            <span className="text-sm font-bold text-gray-900">Total HT</span>
                            <span className="text-base font-bold text-primary">{formatEuroAmount(selectedRoomTotalHt)} € HT</span>
                          </div>

                          <div className="mt-2 flex items-baseline justify-between gap-3 text-sm font-semibold text-gray-900">
                            <span>TVA (20 %)</span>
                            <span>{formatEuroAmount(selectedRoomVatAmount)} €</span>
                          </div>

                          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-gray-200 pt-3">
                            <span className="text-sm font-bold text-gray-900">Total TTC</span>
                            <span className="text-base font-bold text-primary">{formatEuroAmount(selectedRoomTotalTtc)} € TTC</span>
                          </div>
                        </div>

                        {!isDesktop ? (
                          <button
                            type="button"
                            onClick={() => setShowMobileRoomContactStep(true)}
                            className="mt-6 w-full rounded-xl bg-primary py-4 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary/90"
                          >
                            Confirmer la demande
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </motion.div>

                  <motion.div
                    initial={false}
                    animate={isMobileRoomContactFlow
                      ? {
                          opacity: showMobileRoomContactStep ? 1 : 0,
                          x: showMobileRoomContactStep ? 0 : 20,
                          height: showMobileRoomContactStep ? 'auto' : 0,
                        }
                      : {
                          opacity: 1,
                          x: 0,
                          height: 'auto',
                        }}
                    transition={{duration: 0.25}}
                    className={`rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-3 shadow-sm sm:p-5 ${
                      isMobileRoomContactFlow ? 'overflow-hidden' : ''
                    } ${isMobileRoomContactFlow && !showMobileRoomContactStep ? 'pointer-events-none border-transparent p-0 shadow-none' : ''}`}
                    aria-hidden={isMobileRoomContactFlow && !showMobileRoomContactStep}
                  >
                    <div className="mb-4">
                      <h4 className="text-sm font-bold text-gray-900">Coordonnées</h4>
                      <p className="mt-1 text-sm leading-relaxed text-gray-500">
                        Renseignez vos coordonnées pour que nous puissions revenir vers vous rapidement.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {(reservationType === 'salle' || reservationType === 'bureau') && (
                        <Field
                          id="fullName"
                          label="Nom et prénom"
                          value={contact.fullName}
                          onChange={(value) => setContact((current) => ({...current, fullName: value}))}
                          icon={<User size={16} />}
                          required
                        />
                      )}

                      {(reservationType === 'bureau' || reservationType === 'event' || reservationType === 'salle') && (
                        <Field
                          id="company"
                          label="Nom de l'entreprise"
                          value={contact.company}
                          onChange={(value) => setContact((current) => ({...current, company: value}))}
                          icon={<Building2 size={16} />}
                          required={reservationType === 'salle'}
                        />
                      )}

                      <Field
                        id="email"
                        type="email"
                        label="Email professionnel"
                        value={contact.email}
                        onChange={(value) => setContact((current) => ({...current, email: value}))}
                        icon={<Mail size={16} />}
                        required
                      />
                      <Field
                        id="phone"
                        type="tel"
                        label="Téléphone"
                        value={contact.phone}
                        onChange={(value) => setContact((current) => ({...current, phone: value}))}
                        icon={<Phone size={16} />}
                        required
                      />

                      {reservationType === 'event' ? (
                        <Field
                          id="activity"
                          label="Objet de la demande"
                          value={contact.activity}
                          onChange={(value) => setContact((current) => ({...current, activity: value}))}
                          icon={<Briefcase size={16} />}
                          required
                        />
                      ) : null}

                      {reservationType === 'event' && (
                        <div className="sm:col-span-2">
                          <Field
                            id="attendees"
                            label="Nombre de participants estimé"
                            value={contact.attendees}
                            onChange={(value) => setContact((current) => ({...current, attendees: value}))}
                            icon={<Users size={16} />}
                            required
                          />
                        </div>
                      )}

                      {reservationType !== 'bureau' && (
                        <div className="sm:col-span-2">
                          <label htmlFor="notes" className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
                            Message complémentaire
                          </label>
                          <div className="relative">
                            <MessageSquare className="absolute left-4 top-4 text-gray-400" size={16} />
                            <textarea
                              id="notes"
                              rows={4}
                              value={contact.notes}
                              onChange={(event) => setContact((current) => ({...current, notes: event.target.value}))}
                              placeholder={notesPlaceholder}
                              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm font-medium transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={submitState.status === 'submitting'}
                      className="mt-4 w-full rounded-xl bg-primary py-4 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitState.status === 'submitting' ? 'Envoi en cours…' : submitLabel}
                    </button>
                  </motion.div>
                </div>
              </form>
            )}

            <p className="mt-4 text-center text-xs font-medium text-gray-500">
              La demande est envoyée directement à <a href={`mailto:${siteConfig.email}`} className="text-primary underline underline-offset-4">{siteConfig.email}</a>.
            </p>

              <div className="mt-8">
                <Progress step={reservationType === 'salle' ? 5 : 4} totalSteps={totalSteps} />
              </div>
            </StepFrame>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OfferButton({
  active,
  image,
  title,
  description,
  badge,
  disabled = false,
  onClick,
}: {
  active: boolean;
  image: string;
  title: string;
  description: string;
  badge?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-start gap-4 rounded-2xl border-2 p-5 text-left transition-all lg:h-full lg:flex-col lg:gap-5 ${
        active
          ? 'border-primary bg-primary text-white shadow-md'
          : 'border-transparent bg-white text-gray-900 shadow-sm'
      } ${disabled ? 'cursor-not-allowed opacity-60 grayscale hover:border-transparent' : ''}`}
    >
      <div className="mr-1 h-14 w-14 shrink-0 overflow-hidden rounded-lg lg:mr-0 lg:aspect-square lg:h-auto lg:w-full lg:rounded-[1rem]">
        <img
          src={image}
          alt={title}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="flex min-h-14 flex-1 flex-col justify-center sm:min-h-0 sm:justify-start lg:min-h-0 lg:w-full lg:flex-1 lg:justify-start">
        <div>
          <span className="block text-sm font-bold lg:text-base">{title}</span>
          {badge && (
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
              active ? 'bg-white/15 text-white' : 'bg-primary/10 text-primary'
            }`}>
              {badge}
            </span>
          )}
        </div>
        <span className={`hidden text-xs sm:block lg:mt-3 lg:text-sm ${active ? 'text-white/80' : 'text-gray-500'}`}>{description}</span>
      </div>
    </button>
  );
}

function RoomAttendeesSelect({
  id,
  label,
  value,
  onChange,
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
        {label}
      </label>
      <div className="relative">
        <Users className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm font-medium text-gray-900 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Choisir</option>
          {roomAttendeeOptions.map((count) => (
            <option key={`${id}-${count}`} value={count}>
              {count}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function StepFrame({children, wide = false}: {children: ReactNode; wide?: boolean}) {
  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-none' : 'max-w-2xl'}`}>
      {children}
    </div>
  );
}

function SelectionStep({
  title,
  totalSteps,
  onBack,
  items,
  selectedId,
  onSelect,
  onContinue,
  showContinue,
}: {
  title: string;
  totalSteps: number;
  onBack: () => void;
  items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    icon: ReactNode;
    image?: string;
    disabled?: boolean;
    subtitleLines?: string[];
  }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContinue: () => void;
  showContinue: boolean;
}) {
  const useImageCards = items.every((item) => Boolean(item.image));
  const selectionGridClass = useImageCards
    ? items.length === 2
      ? 'grid grid-cols-1 gap-4 lg:grid-cols-2'
      : 'grid grid-cols-1 gap-4 lg:grid-cols-3'
    : 'grid grid-cols-1 gap-4';

  return (
    <motion.div
      key={title}
      initial={{opacity: 0, x: 20}}
      animate={{opacity: 1, x: 0}}
      exit={{opacity: 0, x: -20}}
      transition={{duration: 0.25}}
      className="w-full"
    >
      <StepFrame>
        <div className="mb-6 flex items-center gap-3">
          <button type="button" onClick={onBack} className="text-gray-400 transition-colors hover:text-black" aria-label="Revenir à l'étape précédente">
            <ArrowRight size={16} className="rotate-180" />
          </button>
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        </div>

        <div className={`mb-8 ${selectionGridClass}`}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => onSelect(item.id)}
              className={`flex items-center rounded-2xl border-2 p-4 text-left transition-all ${
                selectedId === item.id
                  ? 'border-primary bg-primary text-white shadow-md'
                  : 'border-transparent bg-white text-gray-900 shadow-sm'
              } ${
                useImageCards && item.image ? 'lg:h-full lg:flex-col lg:items-start lg:gap-5' : ''
              } ${item.disabled ? 'cursor-not-allowed opacity-60 grayscale' : ''}`}
            >
              {item.image ? (
                <div className={`mr-4 h-12 w-12 shrink-0 overflow-hidden rounded-lg ${
                  useImageCards ? 'lg:mr-0 lg:aspect-square lg:h-auto lg:w-full lg:rounded-[1rem]' : ''
                }`}>
                  <img
                    src={item.image}
                    alt={item.title}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ) : (
                <div className={`mr-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
                  selectedId === item.id ? 'bg-white/20' : 'bg-primary/10 text-primary'
                }`}>
                  {item.icon}
                </div>
              )}
              <div className={useImageCards ? 'lg:w-full' : ''}>
                <span className={`block font-bold ${useImageCards ? 'text-sm lg:text-base' : 'text-sm'}`}>{item.title}</span>

                {item.subtitleLines?.length ? (
                  <div className={`space-y-1.5 ${useImageCards ? 'mt-2 lg:text-sm' : 'mt-2'} text-xs`}>
                    {item.subtitleLines.map((line, lineIndex) => (
                      <div
                        key={`${item.id}-line-${lineIndex}`}
                        className={selectedId === item.id ? 'text-white/80' : 'text-gray-500'}
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                ) : item.subtitle ? (
                  <span className={`text-xs ${useImageCards ? 'mt-2 block lg:text-sm' : ''} ${selectedId === item.id ? 'text-white/80' : 'text-gray-500'}`}>{item.subtitle}</span>
                ) : null}
              </div>
            </button>
          ))}
        </div>

        {showContinue ? (
          <button
            type="button"
            disabled={!selectedId}
            onClick={onContinue}
            className="mb-8 w-full rounded-xl bg-primary py-4 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continuer
          </button>
        ) : null}

        <Progress step={2} totalSteps={totalSteps} />
      </StepFrame>
    </motion.div>
  );
}

function Progress({step, totalSteps}: {step: number; totalSteps: number}) {
  return (
    <div className="space-y-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{width: `${(step / totalSteps) * 100}%`}} />
      </div>
      <p className="text-center text-xs font-bold text-gray-500">Étape {step} sur {totalSteps}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${highlight ? 'border-primary/30 bg-primary/5' : 'border-gray-200 bg-gray-50'}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-2 text-sm font-semibold ${highlight ? 'text-primary' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  icon,
  type = 'text',
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: ReactNode;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </label>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>
        <input
          id={id}
          type={type}
          value={value}
          required={required}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm font-medium transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  );
}
