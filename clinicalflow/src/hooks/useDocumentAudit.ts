import { useState, useEffect, useCallback } from 'react';
import { documentAuditStore } from '@/stores/documentAuditStore';
import { DocumentAuditLog, DocumentAuditAction } from '@/types';

export const useDocumentAudit = () => {
  const [auditLogs, setAuditLogs] = useState<DocumentAuditLog[]>(documentAuditStore.getAll());

  useEffect(() => {
    const unsub = documentAuditStore.subscribe(() => setAuditLogs([...documentAuditStore.getAll()]));
    return unsub;
  }, []);

  const logAccess = useCallback((entry: {
    userId: string;
    patientId: string;
    documentId: string;
    action: DocumentAuditAction;
    clinicId?: string;
    metadata?: Record<string, string>;
  }) => {
    const log: DocumentAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: entry.userId,
      patientId: entry.patientId,
      documentId: entry.documentId,
      action: entry.action,
      timestamp: new Date().toISOString(),
      clinicId: entry.clinicId,
      metadata: entry.metadata,
    };
    documentAuditStore.add(log);
    return log;
  }, []);

  const logPatientAccess = useCallback((entry: {
    userId: string;
    patientId: string;
    clinicId?: string;
  }) => {
    return logAccess({
      ...entry,
      documentId: `patient:${entry.patientId}`,
      action: 'view_patient',
    });
  }, [logAccess]);

  const logPrescriptionAccess = useCallback((entry: {
    userId: string;
    patientId: string;
    prescriptionId: string;
    action: 'view_prescription' | 'edit_prescription';
    clinicId?: string;
  }) => {
    return logAccess({
      userId: entry.userId,
      patientId: entry.patientId,
      documentId: `rx:${entry.prescriptionId}`,
      action: entry.action,
      clinicId: entry.clinicId,
    });
  }, [logAccess]);

  const getDocumentLogs = useCallback((documentId: string): DocumentAuditLog[] => {
    return documentAuditStore.filter(l => l.documentId === documentId);
  }, [auditLogs]);

  const getPatientLogs = useCallback((patientId: string): DocumentAuditLog[] => {
    return documentAuditStore.filter(l => l.patientId === patientId);
  }, [auditLogs]);

  const getClinicLogs = useCallback((clinicId: string): DocumentAuditLog[] => {
    return documentAuditStore.filter(l => l.clinicId === clinicId);
  }, [auditLogs]);

  const getRecentLogs = useCallback((limit = 50): DocumentAuditLog[] => {
    return [...documentAuditStore.getAll()]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }, [auditLogs]);

  return {
    auditLogs,
    logAccess,
    logPatientAccess,
    logPrescriptionAccess,
    getDocumentLogs,
    getPatientLogs,
    getClinicLogs,
    getRecentLogs,
  };
};
