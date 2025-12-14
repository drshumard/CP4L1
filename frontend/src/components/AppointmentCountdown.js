import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Calendar, Clock, MapPin, User, Phone, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

const AppointmentCountdown = ({ appointment }) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isPast: false
  });

  useEffect(() => {
    if (!appointment?.session_date) return;

    const calculateTimeLeft = () => {
      const appointmentDate = new Date(appointment.session_date);
      const now = new Date();
      const difference = appointmentDate - now;

      if (difference <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
      }

      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
        isPast: false
      };
    };

    // Initial calculation
    setTimeLeft(calculateTimeLeft());

    // Update every second
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [appointment?.session_date]);

  if (!appointment) return null;

  const appointmentDate = new Date(appointment.session_date);
  
  // Format date for display
  const formattedDate = appointmentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  });

  // Generate calendar URLs
  const generateGoogleCalendarUrl = () => {
    const startDate = appointmentDate.toISOString().replace(/-|:|\.\d+/g, '');
    const endDate = new Date(appointmentDate.getTime() + 60 * 60 * 1000).toISOString().replace(/-|:|\.\d+/g, ''); // 1 hour duration
    const title = encodeURIComponent('Dr. Shumard Consultation');
    const details = encodeURIComponent('Your personal wellness consultation with Dr. Shumard. Be prepared with your health questions and goals.');
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDate}/${endDate}&details=${details}`;
  };

  const generateAppleCalendarUrl = () => {
    const startDate = appointmentDate.toISOString();
    const endDate = new Date(appointmentDate.getTime() + 60 * 60 * 1000).toISOString();
    
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:${startDate.replace(/-|:|\.\d+/g, '').slice(0, -1)}Z
DTEND:${endDate.replace(/-|:|\.\d+/g, '').slice(0, -1)}Z
SUMMARY:Dr. Shumard Consultation
DESCRIPTION:Your personal wellness consultation with Dr. Shumard. Be prepared with your health questions and goals.
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    return URL.createObjectURL(blob);
  };

  const generateOutlookCalendarUrl = () => {
    const startDate = appointmentDate.toISOString();
    const endDate = new Date(appointmentDate.getTime() + 60 * 60 * 1000).toISOString();
    const title = encodeURIComponent('Dr. Shumard Consultation');
    const details = encodeURIComponent('Your personal wellness consultation with Dr. Shumard. Be prepared with your health questions and goals.');
    
    return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${startDate}&enddt=${endDate}&body=${details}`;
  };

  const handleAppleCalendar = () => {
    const url = generateAppleCalendarUrl();
    const link = document.createElement('a');
    link.href = url;
    link.download = 'consultation.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const TimeBlock = ({ value, label }) => (
    <div className="text-center">
      <motion.div
        key={value}
        initial={{ scale: 1.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-gradient-to-br from-teal-500 to-cyan-600 text-white rounded-lg p-3 min-w-[60px] shadow-lg"
      >
        <div className="text-2xl sm:text-3xl font-bold">{String(value).padStart(2, '0')}</div>
      </motion.div>
      <div className="text-xs text-gray-600 mt-1 font-medium">{label}</div>
    </div>
  );

  return (
    <Card className="glass-dark border-0 shadow-xl overflow-hidden">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
            <Calendar className="text-white" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800">Your Upcoming Consultation</h3>
            <p className="text-sm text-gray-600">With Dr. Shumard</p>
          </div>
        </div>

        {/* Countdown Timer */}
        {!timeLeft.isPast ? (
          <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl p-4 mb-6">
            <p className="text-center text-sm text-gray-600 mb-3 font-medium">Time Until Your Appointment</p>
            <div className="flex justify-center gap-3">
              <TimeBlock value={timeLeft.days} label="Days" />
              <TimeBlock value={timeLeft.hours} label="Hours" />
              <TimeBlock value={timeLeft.minutes} label="Min" />
              <TimeBlock value={timeLeft.seconds} label="Sec" />
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 mb-6 text-center">
            <p className="text-green-700 font-semibold">Your appointment time has arrived or passed.</p>
            <p className="text-sm text-green-600 mt-1">Check your email for any follow-up instructions.</p>
          </div>
        )}

        {/* Appointment Details */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3 text-gray-700">
            <Calendar className="text-teal-600 flex-shrink-0" size={18} />
            <span className="font-medium">{formattedDate}</span>
          </div>
          <div className="flex items-center gap-3 text-gray-700">
            <Clock className="text-teal-600 flex-shrink-0" size={18} />
            <span className="font-medium">{formattedTime}</span>
          </div>
          {appointment.first_name && appointment.last_name && (
            <div className="flex items-center gap-3 text-gray-700">
              <User className="text-teal-600 flex-shrink-0" size={18} />
              <span>{appointment.first_name} {appointment.last_name}</span>
            </div>
          )}
          {appointment.mobile_phone && (
            <div className="flex items-center gap-3 text-gray-700">
              <Phone className="text-teal-600 flex-shrink-0" size={18} />
              <span>{appointment.mobile_phone}</span>
            </div>
          )}
        </div>

        {/* Add to Calendar Buttons */}
        <div className="space-y-2">
          <p className="text-sm text-gray-600 font-medium mb-2">Add to Calendar:</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 text-sm"
              onClick={() => window.open(generateGoogleCalendarUrl(), '_blank')}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm-1-6v-4H7v-2h4V6h2v4h4v2h-4v4h-2z"/>
              </svg>
              Google
              <ExternalLink size={12} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 text-sm"
              onClick={handleAppleCalendar}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83"/>
              </svg>
              Apple
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 text-sm"
              onClick={() => window.open(generateOutlookCalendarUrl(), '_blank')}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.31.3.75V12zm-6-8.25v3h3v-3h-3zm0 4.5v3h3v-3h-3zm0 4.5v1.83l3.05-1.83H18zm-5.25-9v3h3.75v-3h-3.75zm0 4.5v3h3.75v-3h-3.75zm0 4.5v2.03l2.41 1.5 1.34-.8v-2.73h-3.75zM9 3.75V6h2l.13.01.12.04v-2.3H9zM1.13 7.5v8.38h4.62V7.5H1.13zm9.13 4.59q-.13.23-.36.38-.24.14-.5.14-.28 0-.51-.15-.23-.14-.36-.4-.13-.27-.13-.56 0-.3.13-.57.13-.25.36-.4.23-.14.5-.14t.51.14q.23.14.36.4.14.27.14.57 0 .28-.14.59z"/>
              </svg>
              Outlook
              <ExternalLink size={12} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AppointmentCountdown;
