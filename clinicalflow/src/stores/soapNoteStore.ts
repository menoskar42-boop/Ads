import { SOAPNote } from '@/types';
import { createStore } from './createStore';

export const soapNoteStore = createStore<SOAPNote>([], 'cf_soap_notes');
