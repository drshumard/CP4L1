import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Calendar, Clock, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

const AppointmentCountdown = ({ appointment }) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    isPast: false
  });
  const [userTimezone, setUserTimezone] = useState('');
  const [formattedDateTime, setFormattedDateTime] = useState({ date: '', time: '' });
  const [progress, setProgress] = useState(0);

  // Detect user timezone via IP geolocation, then browser locale fallback
  useEffect(() => {
    const detectTimezone = async () => {
      // Method 1: Try IP geolocation
      try {
        const response = await fetch('https://ipapi.co/json/', { timeout: 5000 });
        if (response.ok) {
          const data = await response.json();
          if (data.timezone) {
            setUserTimezone(data.timezone);
            return;
          }
        }
      } catch (e) {
        console.log('IP geolocation failed, trying alternative...');
      }

      // Method 2: Try alternative IP geolocation service
      try {
        const response = await fetch('https://worldtimeapi.org/api/ip', { timeout: 5000 });
        if (response.ok) {
          const data = await response.json();
          if (data.timezone) {
            setUserTimezone(data.timezone);
            return;
          }
        }
      } catch (e) {
        console.log('Alternative IP geolocation failed, using browser locale...');
      }

      // Method 3: Infer from browser locale and Intl API
      try {
        // Get timezone from Intl API (based on system settings)
        const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        
        // Also get locale info
        const locale = navigator.language || navigator.userLanguage || 'en-US';
        
        // Use the browser timezone but note it's from locale
        setUserTimezone(browserTimezone);
      } catch (e) {
        setUserTimezone('Local Time');
      }
    };

    detectTimezone();
  }, []);

  useEffect(() => {
    if (!appointment?.session_date || !userTimezone) return;

    const appointmentDate = new Date(appointment.session_date);
    
    // Extract clean timezone name (remove locale info if present)
    const cleanTimezone = userTimezone.split(' (')[0];

    // Format date and time in detected timezone
    const dateOptions = {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: cleanTimezone !== 'Local Time' ? cleanTimezone : undefined
    };
    
    const timeOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: cleanTimezone !== 'Local Time' ? cleanTimezone : undefined
    };

    try {
      setFormattedDateTime({
        date: appointmentDate.toLocaleDateString('en-US', dateOptions),
        time: appointmentDate.toLocaleTimeString('en-US', timeOptions)
      });
    } catch (e) {
      // Fallback if timezone is invalid
      setFormattedDateTime({
        date: appointmentDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        time: appointmentDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      });
    }

    const calculateTimeLeft = () => {
      const now = new Date();
      const difference = appointmentDate - now;

      if (difference <= 0) {
        return { days: 0, hours: 0, minutes: 0, isPast: true };
      }

      // Calculate progress (assuming max 30 days countdown)
      const maxDays = 30 * 24 * 60 * 60 * 1000;
      const elapsed = maxDays - Math.min(difference, maxDays);
      const progressPercent = (elapsed / maxDays) * 100;
      setProgress(progressPercent);

      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        isPast: false
      };
    };

    // Initial calculation
    setTimeLeft(calculateTimeLeft());

    // Update every minute (no need for seconds)
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 60000);

    return () => clearInterval(timer);
  }, [appointment?.session_date, userTimezone]);

  if (!appointment) return null;

  // Hide the banner completely if appointment time has passed
  if (timeLeft.isPast) return null;

  const appointmentDate = new Date(appointment.session_date);

  // Generate calendar URLs
  const generateGoogleCalendarUrl = () => {
    const startDate = appointmentDate.toISOString().replace(/-|:|\.\d+/g, '');
    const endDate = new Date(appointmentDate.getTime() + 60 * 60 * 1000).toISOString().replace(/-|:|\.\d+/g, '');
    const title = encodeURIComponent('Diabetes Reversal Strategy Session');
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
SUMMARY:Diabetes Reversal Strategy Session
DESCRIPTION:Your personal wellness consultation with Dr. Shumard. Be prepared with your health questions and goals.
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    return URL.createObjectURL(blob);
  };

  const generateOutlookCalendarUrl = () => {
    const startDate = appointmentDate.toISOString();
    const endDate = new Date(appointmentDate.getTime() + 60 * 60 * 1000).toISOString();
    const title = encodeURIComponent('Diabetes Reversal Strategy Session');
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

  // Calculate circumference for progress circle
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 rounded-3xl p-6 shadow-lg border border-blue-100">
      {/* Upper Section */}
      <div className="flex items-center gap-6 mb-8">
        {/* Circular Progress with Image */}
        <div className="relative flex-shrink-0">
          <svg className="w-28 h-28 transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="56"
              cy="56"
              r={radius}
              stroke="#E0E7FF"
              strokeWidth="4"
              fill="none"
            />
            {/* Progress circle */}
            <motion.circle
              cx="56"
              cy="56"
              r={radius}
              stroke="#4F46E5"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </svg>
          {/* Image inside circle */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center">
              <img 
                src="https://portal-drshumard.b-cdn.net/logo.png"
                alt="Dr. Shumard"
                className="w-16 h-16 object-contain"
              />
            </div>
          </div>
        </div>

        {/* Event Info */}
        <div className="flex-1">
          <h3 className="text-xl font-bold text-gray-900 mb-3">
            Diabetes Reversal Strategy Session
          </h3>
          
          <div className="flex flex-wrap items-center gap-4 text-gray-600 mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="text-indigo-500" size={18} />
              <span className="text-sm font-medium">{formattedDateTime.date}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="text-indigo-500" size={18} />
              <span className="text-sm font-medium">{formattedDateTime.time}</span>
            </div>
          </div>

          {/* Timezone indicator */}
          <p className="text-xs text-gray-500 mb-4">
            Time shown in your timezone: {userTimezone}
          </p>

          {/* Add to Calendar Button */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-full px-4"
              onClick={() => window.open(generateGoogleCalendarUrl(), '_blank')}
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.5 3h-3V1.5a.5.5 0 00-1 0V3h-7V1.5a.5.5 0 00-1 0V3h-3A2.5 2.5 0 002 5.5v14A2.5 2.5 0 004.5 22h15a2.5 2.5 0 002.5-2.5v-14A2.5 2.5 0 0019.5 3zm-15 1h3v1a.5.5 0 001 0V4h7v1a.5.5 0 001 0V4h3A1.5 1.5 0 0121 5.5V8H3V5.5A1.5 1.5 0 014.5 4zM19.5 21h-15A1.5 1.5 0 013 19.5V9h18v10.5a1.5 1.5 0 01-1.5 1.5z"/>
              </svg>
              Google
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full px-4 border-indigo-200 hover:bg-indigo-50"
              onClick={handleAppleCalendar}
            >
              Apple
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full px-4 border-indigo-200 hover:bg-indigo-50"
              onClick={() => window.open(generateOutlookCalendarUrl(), '_blank')}
            >
              Outlook
              <ExternalLink size={12} className="ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Countdown Section */}
      <div className="flex justify-around items-center pt-6 border-t border-blue-100">
        {/* Days */}
        <div className="text-center">
          <motion.div
            key={timeLeft.days}
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-4xl sm:text-5xl font-bold text-gray-900"
          >
            {String(timeLeft.days).padStart(2, '0')}
          </motion.div>
          <div className="text-sm text-gray-600 mt-1 font-medium">Days</div>
        </div>

        {/* Hours */}
        <div className="text-center">
          <motion.div
            key={timeLeft.hours}
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-4xl sm:text-5xl font-bold text-gray-900"
          >
            {String(timeLeft.hours).padStart(2, '0')}
          </motion.div>
          <div className="text-sm text-gray-600 mt-1 font-medium">Hours</div>
        </div>

        {/* Minutes */}
        <div className="text-center">
          <motion.div
            key={timeLeft.minutes}
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-4xl sm:text-5xl font-bold text-gray-900"
          >
            {String(timeLeft.minutes).padStart(2, '0')}
          </motion.div>
          <div className="text-sm text-gray-600 mt-1 font-medium">Minutes</div>
        </div>
      </div>
    </div>
  );
};

export default AppointmentCountdown;
