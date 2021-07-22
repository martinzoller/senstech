from __future__ import unicode_literals
from frappe import _

def get_data():

  return[
    {
      'label': _('🛍️ Einkauf'),
      'items': [
        {
          'type': 'doctype',
          'name': 'Supplier',
          'label': _('Lieferant')
        },
        {
          'type': 'doctype',
          'name': 'Purchase Order',
          'label': _('Lieferantenauftrag')
        },
        {
          'type': 'report',
          'is_query_report': False,
          'doctype': 'Purchase Order',
          'name': 'Lieferantenauftrag mit Artikel SR',
          'label': _('Lieferantenauftrag: Bericht mit Artikel')
        },
        {
          'type': 'doctype',
          'name': 'Purchase Invoice',
          'label': _('Lieferanten-RG')
        },
        {
          'type': 'doctype',
          'name': 'Purchase Receipt',
          'label': _('Wareneingang')
        }
      ]
    },
    {
      'label': _('🤝 Verkauf'),
      'items': [
        {
          'type': 'doctype',
          'name': 'Customer',
          'label': _('Kunde')
        },
        {
          'type': 'doctype',
          'name': 'Quotation',
          'label': _('Offerte')
        },
        {
          'type': 'doctype',
          'name': 'Sales Order',
          'label': _('Kunden-AB')
        },
        {
          'type': 'doctype',
          'name': 'Delivery Note',
          'label': _('Lieferschein')
        },
        {
          'type': 'doctype',
          'name': 'Sales Invoice',
          'label': _('Kunden-RG')
        },
        {
          'type': 'doctype',
          'name': 'Blanket Order',
          'label': _('Rahmenauftrag')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Sales Order',
          'name': 'Ordered Items To Be Delivered',
          'label': _('Ausstehende Lieferungen')
        }
      ]
    },
    {
      'label': _('💬 CRM'),
      'items': [
        {
          'type': 'doctype',
          'name': 'Contact',
          'label': _('Kontaktperson')
        },
        {
          'type': 'doctype',
          'name': 'Address',
          'label': _('Adresse')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Address',
          'name': 'Address And Contacts',
          'label': _('Adress- und Kontaktliste'),
          'route_options': { 'party_type': 'Customer' }
        },
        {
          'type': 'doctype',
          'name': 'ToDo',
          'label': _('Meine Pendenzen')
        },
        {
          'type': 'doctype',
          'name': 'Event',
          'label': _('Meine Termine'),
          'link': 'List/Event/Calendar'
        },
        {
          'type': 'doctype',
          'name': 'Email Queue',
          'label': _('Gesendete E-Mails')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Sales Order',
          'name': 'Inactive Customers',
          'label': _('Inaktive Kunden')
        },
        {
          'type': 'page',
          'name': 'sync_mailchimp',
          'label': _('MailChimp-Synchronisierung')
        }
      ]
    },
    {
      'label': _('🏭 Artikel und Produktion'),
      'items': [
        {
          'type': 'doctype',
          'name': 'Item',
          'label': _('Artikel')
        },
        {
          'type': 'doctype',
          'name': 'Item Attribute',
          'label': _('Artikelattribut')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Item',
          'name': 'Item Variant Details',
          'label': _('Übersicht der Artikelvarianten')
        },
        {
          'type': 'report',
          'is_query_report': False,
          'doctype': 'Item Price',
          'name': 'Item-wise Price List Rate',
          'label': _('Artikelpreise')
        },
        {
          'type': 'doctype',
          'name': 'Batch',
          'label': _('Produktionscharge')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'name': 'Produktionsplanung',
          'label': _('Produktionsplanung')
        },
        {
          'type': 'page',
          'name': 'stock-balance',
          'label': _('Lagerbestandsübersicht')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Batch',
          'name': 'Batch-Wise Balance History',
          'label': _('Lagerbestand nach Chargen')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Stock Ledger Entry',
          'name': 'Lagerbuch MZ',
          'label': _('Lagerbuch (Buchungshistorie)')
        },
        {
          'type': 'doctype',
          'name': 'Senstech Histogramm',
          'label': _('Definition Histogramme')
        }
      ]
    },
    {
      'label': _('💰 Zahlungs- und Mahnwesen'),
      'items': [
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Sales Invoice',
          'name': 'Ordered Items To Be Billed',
          'label': _('Unverrechnete Posten')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Sales Invoice',
          'name': 'Accounts Receivable',
          'label': _('Forderungen nach Rechnung')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Sales Invoice',
          'name': 'Accounts Receivable Summary',
          'label': _('Forderungen nach Kunde')
        },
        {
          'type': 'doctype',
          'name': 'Payment Reminder',
          'label': _('Mahnung')
        },
        {
          'type': 'doctype',
          'name': 'Payment Proposal',
          'label': _('Zahlungsvorschlag')
        },
        {
          'type': 'page',
          'name': 'bank_wizard',
          'label': _('Bankassistent')
        },
        {
          'type': 'page',
          'name': 'bankimport',
          'label': _('Bankdaten importieren')
        },
        {
          'type': 'page',
          'name': 'match_payments',
          'label': _('Zahlungen zuordnen')
        },
        {
          'type': 'page',
          'name': 'payment_export',
          'label': _('Zahlungsdatei erstellen')
        }
      ]
    },
    {
      'label': _('🗃️ Buchhaltung'),
      'items': [
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'GL Entry',
          'name': 'General Ledger',
          'label': _('Hauptbuch')
        },
        {
          'type': 'doctype',
          'name': 'Journal Entry',
          'label': _('Buchungssatz')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Purchase Invoice',
          'name': 'Accounts Payable',
          'label': _('Verbindlichkeiten nach Rechnung')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Purchase Invoice',
          'name': 'Accounts Payable Summary',
          'label': _('Verbindlichkeiten nach Lieferant')
        },
        {
          'type': 'doctype',
          'name': 'Payment Entry',
          'label': _('Zahlung')
        },
        {
          'type': 'doctype',
          'name': 'VAT Declaration',
          'label': _('Mehrwertsteuerdeklaration')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Sales Invoice',
          'name': 'Kontrolle MwSt',
          'label': _('Kontrolle MwSt')
        }
      ]
    },
    {
      'label': _('📆 Jahresabschluss'),
      'items': [
        {
          'type': 'doctype',
          'name': 'Fiscal Year',
          'label': _('Geschäftsjahr')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'GL Entry',
          'name': 'Balance Sheet',
          'label': _('Bilanz')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'GL Entry',
          'name': 'Profit and Loss Statement',
          'label': _('Erfolgsrechnung')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'GL Entry',
          'name': 'Cash Flow',
          'label': _('Cash Flow')
        }
      ]
    },
    {
      'label': _('📊 Statistiken'),
      'items': [
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Sales Order',
          'name': 'Sales Order Trends',
          'label': _('Umsatz bestellt nach Quartal'),
          'route_options': { 'period': 'Quarterly' }
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Sales Invoice',
          'name': 'Sales Invoice Trends',
          'label': _('Umsatz verrechnet nach Quartal'),
          'route_options': { 'period': 'Quarterly' }
        },
        {
          'type': 'report',
          'is_query_report': False,
          'doctype': 'Sales Invoice',
          'name': 'Gestellte Rechnungen MZ',
          'label': _('Umsatz verrechnet detailliert'),
        },
#        {
#          'type': 'report',
#          'is_query_report': True,
#          'doctype': 'Sales Order',
#          'name': 'Sales Analytics',
#          'label': _('Ertrag nach Artikel'),
#          'route_options': { 'range': 'Quarterly', 'tree_type': 'Item' }
#        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Customer',
          'name': 'Customer Acquisition and Loyalty',
          'label': _('Kundengewinnung und -bindung')
        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Purchase Invoice',
          'name': 'Purchase Invoice Trends',
          'label': _('Aufwand nach Quartal'),
          'link': 'query-report/Purchase Invoice Trends?period=Quarterly'
        },
#        {
#          'type': 'report',
#          'is_query_report': True,
#          'doctype': 'Purchase Order',
#          'name': 'Purchase Analytics',
#          'label': _('Aufwand nach EK-Artikel'),
#          'link': 'query-report/Purchase Analytics?tree_type=Item&range=Quarterly'
#        },
        {
          'type': 'report',
          'is_query_report': True,
          'doctype': 'Stock Entry',
          'name': 'Stock Analytics',
          'label': _('Lagerbestand nach Artikel'),
          'link': 'query-report/Stock Analytics?value_quantity=Quantity&warehouse=Fertigerzeugnisse - ST&range=Quarterly'
        }
      ]
    },
    {
      'label': _('👩‍💼 Personalwesen'),
      'items': [
        {
          'type': 'doctype',
          'name': 'Employee',
          'label': _('Mitarbeiter')
        },
        {
          'type': 'doctype',
          'name': 'Designation',
          'label': _('Jobtitel')
        },
        {
          'type': 'doctype',
          'name': 'HR Settings',
          'label': _('Einstellungen zum Modul Personalwesen')
        }
      ]
    },
    {
      'label': _('👮 Benutzer und Berechtigungen'),
      'items': [
        {
          'type': 'doctype',
          'name': 'User',
          'label': _('Benutzer')
        },
        {
          'type': 'doctype',
          'name': 'User Permission',
          'label': _('Benutzerberechtigungen')
        },
        {
          'type': 'doctype',
          'name': 'Role',
          'label': _('Rolle')
        },
        {
          'type': 'page',
          'name': 'permission-manager',
          'label': _('Rollenberechtigungen für Dokumenttypen')
        },
        {
          'type': 'doctype',
          'name': 'Role Permission for Page and Report',
          'label': _('Rollenberechtigungen für Seiten und Berichte')
        }
      ]
    },
    {
      'label': _('🛠️ Werkzeuge'),
      'items': [
        {
          'type': 'doctype',
          'name': 'File',
          'label': _('Dateimanager')
        },
        {
          'type': 'doctype',
          'name': 'Deleted Document',
          'label': _('Dokumente-Papierkorb')
        },
        {
          'type': 'doctype',
          'name': 'System Settings',
          'label': _('>> Einstellungen'),
          'link': 'modules/Senstech Settings'
        }
      ]
    }
  ]
