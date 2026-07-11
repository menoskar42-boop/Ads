import { format, parseISO } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';

/**
 * Format a date string based on the current language
 * Arabic: DD/MM/YYYY or DD Month YYYY
 * English: keeps default format
 */
export function formatDate(
  dateString: string,
  language: 'en' | 'ar',
  formatType: 'short' | 'long' = 'short'
): string {
  if (!dateString) return '';
  
  try {
    const date = parseISO(dateString);
    
    if (language === 'ar') {
      // Arabic formats
      if (formatType === 'long') {
        return format(date, 'd MMMM yyyy', { locale: ar });
      }
      return format(date, 'dd/MM/yyyy');
    }
    
    // English formats
    if (formatType === 'long') {
      return format(date, 'MMMM d, yyyy', { locale: enUS });
    }
    return format(date, 'MMM d, yyyy', { locale: enUS });
  } catch {
    return dateString;
  }
}

/**
 * Format a time string based on the current language
 */
export function formatTime(timeString: string, language: 'en' | 'ar'): string {
  if (!timeString) return '';
  
  try {
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    
    if (language === 'ar') {
      const period = hours >= 12 ? 'م' : 'ص';
      const hour12 = hours % 12 || 12;
      return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
    }
    
    return format(date, 'h:mm a', { locale: enUS });
  } catch {
    return timeString;
  }
}

/**
 * Format date and time together
 */
export function formatDateTime(
  dateString: string,
  timeString: string,
  language: 'en' | 'ar'
): string {
  const formattedDate = formatDate(dateString, language);
  const formattedTime = formatTime(timeString, language);
  
  if (language === 'ar') {
    return `${formattedDate} - ${formattedTime}`;
  }
  return `${formattedDate} at ${formattedTime}`;
}
