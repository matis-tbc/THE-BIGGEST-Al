import React, { useEffect, useState, useRef } from 'react';
import { parseCSV, validateEmail } from '../utils/csvParser';

interface Contact {
  id: string;
  name: string;
  email: string;
  [key: string]: string;
}

interface ContactImportProps {
  onContactsImported: (contacts: Contact[]) => void;
  onBack: () => void;
}

export const ContactImport: React.FC<ContactImportProps> = ({ onContactsImported, onBack }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const revalidate = (nextContacts: Contact[]) => {
    const errors: string[] = [];
    const emailSet = new Set<string>();
    nextContacts.forEach((contact, index) => {
      if (!contact.email || !validateEmail(contact.email)) {
        errors.push(`Row ${index + 2}: Invalid email "${contact.email}"`);
      }
      if (contact.email && emailSet.has(contact.email.toLowerCase())) {
        errors.push(`Row ${index + 2}: Duplicate email "${contact.email}"`);
      }
      emailSet.add((contact.email || '').toLowerCase());
    });
    setValidationErrors(errors);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setValidationErrors([]);

    try {
      const text = await file.text();
      const parsedContacts = parseCSV(text);
      const discoveredHeaders = Array.from(
        parsedContacts.reduce((acc, contact) => {
          Object.keys(contact).forEach(key => acc.add(key));
          return acc;
        }, new Set<string>(['name', 'email']))
      );
      setHeaders(discoveredHeaders);
      
      const normalizedContacts: Contact[] = [];
      
      parsedContacts.forEach((contact, index) => {
        normalizedContacts.push({
          id: `contact-${Date.now()}-${index}`,
          name: contact.name || contact.email,
          email: contact.email,
          ...contact
        });
      });

      setContacts(normalizedContacts);
      revalidate(normalizedContacts);
      
      if (normalizedContacts.length === 0) {
        setError('No valid contacts found. Please check your CSV format.');
      }
    } catch (err) {
      console.error('CSV parsing error:', err);
      setError('Failed to parse CSV file. Please check the format.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCellChange = (contactId: string, key: string, value: string) => {
    const next = contacts.map(contact => {
      if (contact.id !== contactId) return contact;
      const updated = { ...contact, [key]: value };
      if (key === 'email' && !updated.name) {
        updated.name = value.split('@')[0] || value;
      }
      if (key === 'name') {
        updated.name = value;
      }
      return updated;
    });
    setContacts(next);
    revalidate(next);
  };

  const handleDeleteRow = (contactId: string) => {
    const next = contacts.filter(contact => contact.id !== contactId);
    setContacts(next);
    revalidate(next);
  };

  const handleAddRow = () => {
    const next = [
      ...contacts,
      {
        id: `contact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: '',
        email: '',
      },
    ];
    setContacts(next);
    revalidate(next);
  };

  const applyBulkAction = (action: 'trim' | 'dedupe' | 'invalid-only') => {
    let next = [...contacts];
    if (action === 'trim') {
      next = next.map(contact => {
        const updated: Contact = { ...contact };
        Object.keys(updated).forEach(key => {
          updated[key] = (updated[key] || '').trim();
        });
        return updated;
      });
    }
    if (action === 'dedupe') {
      const seen = new Set<string>();
      next = next.filter(contact => {
        const emailKey = (contact.email || '').toLowerCase();
        if (!emailKey) return true;
        if (seen.has(emailKey)) return false;
        seen.add(emailKey);
        return true;
      });
    }
    if (action === 'invalid-only') {
      next = next.filter(contact => validateEmail(contact.email));
    }
    setContacts(next);
    revalidate(next);
  };

  const exportCorrectedCsv = () => {
    if (contacts.length === 0) return;
    const csvHeaders = headers.length ? headers : ['name', 'email'];
    const rows = [
      csvHeaders.join(','),
      ...contacts.map(contact =>
        csvHeaders.map(header => {
          const value = contact[header] || '';
          return `"${String(value).replace(/"/g, '""')}"`;
        }).join(',')
      ),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'contacts-corrected.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const validCount = contacts.filter(contact => validateEmail(contact.email)).length;
  const invalidCount = contacts.length - validCount;

  useEffect(() => {
    if (contacts.length === 0) return;
    const nextHeaders = Array.from(
      contacts.reduce((acc, contact) => {
        Object.keys(contact).forEach(key => {
          if (key !== 'id') acc.add(key);
        });
        return acc;
      }, new Set<string>(['name', 'email']))
    );
    setHeaders(nextHeaders);
  }, [contacts]);

  const handleContinueWithCurrentData = () => {
    if (validCount > 0) {
      onContactsImported(contacts.filter(contact => validateEmail(contact.email)));
    }
  };

  const downloadSampleCSV = () => {
    const sampleData = [
      ['name', 'email', 'company', 'department'],
      ['John Doe', 'john@example.com', 'Acme Corp', 'Sales'],
      ['Jane Smith', 'jane@example.com', 'Tech Inc', 'Marketing'],
      ['Bob Johnson', 'bob@example.com', 'Startup Co', 'Engineering']
    ];
    
    const csvContent = sampleData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sample-contacts.csv';
    link.click();
    
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Contacts</h2>
        <p className="text-gray-600">Upload a CSV file with your contact list. Include columns for name, email, and any merge fields.</p>
      </div>

      {/* File Upload */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="mt-4">
            <label htmlFor="file-upload" className="cursor-pointer">
              <span className="mt-2 block text-sm font-medium text-gray-900">
                {isLoading ? 'Processing...' : 'Upload CSV file'}
              </span>
              <input
                ref={fileInputRef}
                id="file-upload"
                name="file-upload"
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={handleFileSelect}
                disabled={isLoading}
              />
            </label>
            <p className="mt-1 text-sm text-gray-500">
              CSV files only, up to 10MB
            </p>
          </div>
        </div>
      </div>

      {/* Sample CSV Download */}
      <div className="text-center">
        <button
          onClick={downloadSampleCSV}
          className="text-sm text-primary-600 hover:text-primary-500 font-medium"
        >
          Download sample CSV format
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Validation Warnings</h3>
              <div className="mt-2 text-sm text-yellow-700">
                <ul className="list-disc list-inside space-y-1">
                  {validationErrors.slice(0, 5).map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                  {validationErrors.length > 5 && (
                    <li>... and {validationErrors.length - 5} more errors</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contacts Preview */}
      {contacts.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">
                {validCount} valid contacts ({invalidCount} invalid)
              </h3>
              <div className="mt-2 text-sm text-green-700">
                <p>Ready to proceed with email template selection.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contacts Table Preview */}
      {contacts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-gray-900">CSV Editor</h3>
              <div className="flex gap-2">
                <button onClick={() => applyBulkAction('trim')} className="btn-secondary text-xs">Trim fields</button>
                <button onClick={() => applyBulkAction('dedupe')} className="btn-secondary text-xs">Remove duplicates</button>
                <button onClick={() => applyBulkAction('invalid-only')} className="btn-secondary text-xs">Keep valid only</button>
                <button onClick={exportCorrectedCsv} className="btn-secondary text-xs">Export corrected CSV</button>
                <button onClick={handleAddRow} className="btn-secondary text-xs">Add row</button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {headers.filter(header => header !== 'id').map(header => (
                    <th key={header} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {header}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    {headers.filter(header => header !== 'id').map(header => (
                      <td key={header} className="px-4 py-2 text-sm text-gray-900">
                        <input
                          value={contact[header] || ''}
                          onChange={event => handleCellChange(contact.id, header, event.target.value)}
                          className={`w-full border rounded px-2 py-1 text-sm ${
                            header === 'email' && contact.email && !validateEmail(contact.email)
                              ? 'border-red-300 bg-red-50'
                              : 'border-gray-300'
                          }`}
                        />
                      </td>
                    ))}
                    <td className="px-4 py-2 text-sm">
                      {validateEmail(contact.email)
                        ? <span className="text-green-600">Valid</span>
                        : <span className="text-red-600">Invalid email</span>}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <button onClick={() => handleDeleteRow(contact.id)} className="text-red-600 hover:text-red-500">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="btn-secondary"
        >
          Back
        </button>
        <button
          onClick={handleContinueWithCurrentData}
          disabled={validCount === 0}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue ({validCount} valid contacts)
        </button>
      </div>
    </div>
  );
};
