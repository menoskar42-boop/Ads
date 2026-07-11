import * as XLSX from 'xlsx';

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

export const exportToExcel = (
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  fileName: string,
  sheetName: string = 'Sheet1'
): void => {
  // Map data to only include specified columns
  const exportData = data.map(row => {
    const newRow: Record<string, unknown> = {};
    columns.forEach(col => {
      newRow[col.header] = row[col.key];
    });
    return newRow;
  });

  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(exportData);

  // Set column widths
  const columnWidths = columns.map(col => ({
    wch: col.width || 15,
  }));
  worksheet['!cols'] = columnWidths;

  // Create workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Generate filename with date
  const date = new Date().toISOString().split('T')[0];
  const fullFileName = `${fileName}_${date}.xlsx`;

  // Download file
  XLSX.writeFile(workbook, fullFileName);
};

// Export appointments
export const exportAppointmentsToExcel = (
  appointments: Array<{
    date: string;
    time: string;
    patientName: string;
    doctorName: string;
    serviceName: string;
    status: string;
    servicePrice?: number;
    doctorShare?: number;
    clinicShare?: number;
  }>,
  language: 'en' | 'ar',
  includeFinancials: boolean = false
): void => {
  const columns: ExportColumn[] = [
    { header: language === 'ar' ? 'التاريخ' : 'Date', key: 'date', width: 12 },
    { header: language === 'ar' ? 'الوقت' : 'Time', key: 'time', width: 10 },
    { header: language === 'ar' ? 'المريض' : 'Patient', key: 'patientName', width: 20 },
    { header: language === 'ar' ? 'الطبيب' : 'Doctor', key: 'doctorName', width: 20 },
    { header: language === 'ar' ? 'الخدمة' : 'Service', key: 'serviceName', width: 20 },
    { header: language === 'ar' ? 'الحالة' : 'Status', key: 'status', width: 12 },
  ];

  if (includeFinancials) {
    columns.push(
      { header: language === 'ar' ? 'السعر' : 'Price', key: 'servicePrice', width: 10 },
      { header: language === 'ar' ? 'حصة الطبيب' : 'Doctor Share', key: 'doctorShare', width: 12 },
      { header: language === 'ar' ? 'حصة العيادة' : 'Clinic Share', key: 'clinicShare', width: 12 }
    );
  }

  exportToExcel(appointments, columns, language === 'ar' ? 'تقرير_المواعيد' : 'Appointments_Report', language === 'ar' ? 'المواعيد' : 'Appointments');
};

// Export financial report
export const exportFinancialReportToExcel = (
  data: Array<{
    date: string;
    patientName: string;
    doctorName: string;
    serviceName: string;
    total: number;
    doctorShare: number;
    clinicShare: number;
    status: string;
  }>,
  language: 'en' | 'ar'
): void => {
  const columns: ExportColumn[] = [
    { header: language === 'ar' ? 'التاريخ' : 'Date', key: 'date', width: 12 },
    { header: language === 'ar' ? 'المريض' : 'Patient', key: 'patientName', width: 20 },
    { header: language === 'ar' ? 'الطبيب' : 'Doctor', key: 'doctorName', width: 20 },
    { header: language === 'ar' ? 'الخدمة' : 'Service', key: 'serviceName', width: 20 },
    { header: language === 'ar' ? 'المجموع' : 'Total', key: 'total', width: 12 },
    { header: language === 'ar' ? 'حصة الطبيب' : 'Doctor Share', key: 'doctorShare', width: 12 },
    { header: language === 'ar' ? 'حصة العيادة' : 'Clinic Share', key: 'clinicShare', width: 12 },
    { header: language === 'ar' ? 'الحالة' : 'Status', key: 'status', width: 12 },
  ];

  exportToExcel(data, columns, language === 'ar' ? 'التقرير_المالي' : 'Financial_Report', language === 'ar' ? 'التقرير' : 'Report');
};

// Export patient visits
export const exportPatientVisitsToExcel = (
  data: Array<{
    patientName: string;
    phone: string;
    totalVisits: number;
    lastVisit: string;
    totalSpent: number;
  }>,
  language: 'en' | 'ar'
): void => {
  const columns: ExportColumn[] = [
    { header: language === 'ar' ? 'المريض' : 'Patient', key: 'patientName', width: 20 },
    { header: language === 'ar' ? 'الهاتف' : 'Phone', key: 'phone', width: 15 },
    { header: language === 'ar' ? 'عدد الزيارات' : 'Total Visits', key: 'totalVisits', width: 12 },
    { header: language === 'ar' ? 'آخر زيارة' : 'Last Visit', key: 'lastVisit', width: 12 },
    { header: language === 'ar' ? 'إجمالي الإنفاق' : 'Total Spent', key: 'totalSpent', width: 12 },
  ];

  exportToExcel(data, columns, language === 'ar' ? 'تقرير_زيارات_المرضى' : 'Patient_Visits_Report', language === 'ar' ? 'الزيارات' : 'Visits');
};
