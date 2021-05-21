from __future__ import unicode_literals
from frappe import _

def get_data():

  return[
    {
      'label': _('Datenstruktur und -austausch'),
      'items': [
        {
          'type': 'doctype',
          'name': 'DocType',
          'label': _('DocType')
        },
        {
          'type': 'doctype',
          'name': 'Customize Form',
          'label': _('Formular anpassen')
        },
        {
          'type': 'doctype',
          'name': 'Custom Field',
          'label': _('Benutzerdefiniertes Feld')
        },
        {
          'type': 'doctype',
          'name': 'Naming Series',
          'label': _('Nummernkreis')
        },
        {
          'type': 'doctype',
          'name': 'Rename Tool',
          'label': _('Werkzeug zum Massen-Umbenennen')
        },
        {
          'type': 'doctype',
          'name': 'Data Import',
          'label': _('Daten importieren')
        },
        {
          'type': 'doctype',
          'name': 'Data Export',
          'label': _('Daten exportieren')
        }
      ]
    },
    {
      'label': _('Gruppen und Kategorien'),
      'items': [
        {
          'type': 'doctype',
          'name': 'Customer Group',
          'label': _('Kundengruppe'),
          'link': 'Tree/Customer Group'
        },
        {
          'type': 'doctype',
          'name': 'Supplier Group',
          'label': _('Lieferantengruppe'),
          'link': 'Tree/Supplier Group'
        },
        {
          'type': 'doctype',
          'name': 'Item Group',
          'label': _('Artikelgruppe'),
          'link': 'Tree/Item Group'
        },
        {
          'type': 'doctype',
          'name': 'Senstech Funktion',
          'label': _('Senstech Funktion')
        },
        {
          'type': 'doctype',
          'name': 'Lead Source',
          'label': _('Lead Ursprung')
        },
        {
          'type': 'doctype',
          'name': 'Territory',
          'label': _('Region'),
          'link': 'Tree/Territory'
        },
        {
          'type': 'doctype',
          'name': 'Warehouse',
          'label': _('Lager'),
          'link': 'Tree/Warehouse'
        }
      ]
    },
    {
      'label': _('Grunddefinitionen und -vorlagen'),
      'items': [
        {
          'type': 'doctype',
          'name': 'UOM',
          'label': _('Maßeinheit')
        },
        {
          'type': 'doctype',
          'name': 'UOM Conversion Factor',
          'label': _('Maßeinheit-Umrechnungsfaktor')
        },
        {
          'type': 'doctype',
          'name': 'UOM Category',
          'label': _('Maßeinheit-Kategorie')
        },
        {
          'type': 'doctype',
          'name': 'Currency',
          'label': _('Währung')
        },
        {
          'type': 'doctype',
          'name': 'Language',
          'label': _('Sprache')
        },
        {
          'type': 'doctype',
          'name': 'Country',
          'label': _('Land')
        },
        {
          'type': 'doctype',
          'name': 'Address Template',
          'label': _('Adressvorlage')
        },
        {
          'type': 'doctype',
          'name': 'Senstech Berg',
          'label': _('Senstech Berg')
        }
      ]
    },
    {
      'label': _('Druck und Darstellung'),
      'items': [
        {
          'type': 'doctype',
          'name': 'Print Settings',
          'label': _('Druckeinstellungen')
        },
        {
          'type': 'doctype',
          'name': 'Label Printer',
          'label': _('Etikettendrucker: Format')
        },
        {
          'type': 'doctype',
          'name': 'Senstech Settings',
          'label': _('Etikettendrucker: Hostname')
        },
        {
          'type': 'doctype',
          'name': 'Letter Head',
          'label': _('Briefkopf')
        },
        {
          'type': 'doctype',
          'name': 'Translation',
          'label': _('Übersetzung')
        }
      ]
    },
    {
      'label': _('Entwicklung'),
      'items': [
        {
          'type': 'doctype',
          'name': 'Print Format',
          'label': _('Druckformat')
        },
        {
          'type': 'doctype',
          'name': 'Custom Script',
          'label': _('Benutzerdefiniertes Skript')
        },
        {
          'type': 'doctype',
          'name': 'Bulk Update',
          'label': _('Massen-Update')
        },
        {
          'type': 'doctype',
          'name': 'Report',
          'label': _('Bericht')
        },
        {
          'type': 'doctype',
          'name': 'Error Log',
          'label': _('Fehlerprotokoll')
        },
        {
          'type': 'page',
          'name': 'background_jobs',
          'label': _('Hintergrundprozesse')
        }
      ]
    },
    {
      'label': _('E-Mail'),
      'items': [
        {
          'type': 'doctype',
          'name': 'Email Account',
          'label': _('E-Mail-Konto')
        },
        {
          'type': 'doctype',
          'name': 'Email Domain',
          'label': _('E-Mail-Domain')
        },
        {
          'type': 'doctype',
          'name': 'Email Digest',
          'label': _('E-Mail-Bericht')
        }
      ]
    },
    {
      'label': _('Finanzeinstellungen'),
      'items': [
        {
          'type': 'doctype',
          'name': 'Account',
          'label': _('Kontenplan'),
          'route': '#Tree/Account'
        },
        {
          'type': 'doctype',
          'name': 'Cost Center',
          'label': _('Kostenstellenplan '),
          'route': '#Tree/Cost Center'
        },
        {
          'type': 'doctype',
          'name': 'Price List',
          'label': _('Preisliste')
        },
        {
          'type': 'doctype',
          'name': 'Sales Taxes and Charges Template',
          'label': _('Vorlage für Verkaufssteuern und -abgaben ')
        },
        {
          'type': 'doctype',
          'name': 'Purchase Taxes and Charges Template',
          'label': _('Vorlage für Einkaufssteuern und -abgaben ')
        }
      ]
    },
    {
      'label': _('Modulkonfiguration'),
      'items': [
        {
          'type': 'doctype',
          'name': 'Selling Settings',
          'label': _('Vertriebseinstellungen')
        },
        {
          'type': 'doctype',
          'name': 'Stock Settings',
          'label': _('Lager-Einstellungen')
        },
        {
          'type': 'doctype',
          'name': 'Item Variant Settings',
          'label': _('Artikelvarianten-Einstellungen')
        },
        {
          'type': 'doctype',
          'name': 'ERPNextSwiss Settings',
          'label': _('ERPNextSwiss Einstellungen')
        },
        {
          'type': 'doctype',
          'name': 'MailChimpConnector Settings',
          'label': _('MailChimpConnector-Einstellungen')
        },
        {
          'type': 'doctype',
          'name': 'Senstech Settings',
          'label': _('Senstech Einstellungen')
        },
        {
          'type': 'doctype',
          'name': 'Einstellungen Dokumentation',
          'label': _('Senstech Wiki')
        },
        {
          'type': 'doctype',
          'name': 'Google Settings',
          'label': _('Google-Einstellungen')
        },
        {
          'type': 'doctype',
          'name': 'Google Calendar',
          'label': _('Google-Kalender')
        }
      ]
    },
    {
      'label': _('Systemkonfiguration'),
      'items': [
        {
          'type': 'doctype',
          'name': 'System Settings',
          'label': _('Systemverwaltung')
        },
        {
          'type': 'doctype',
          'name': 'Domain Settings',
          'label': _('Aktive Module')
        },
        {
          'type': 'doctype',
          'name': 'Global Defaults',
          'label': _('ERPNext-Einstellungen')
        },
        {
          'type': 'doctype',
          'name': 'Website Settings',
          'label': _('Webseiten-Einstellungen')
        },
        {
          'type': 'doctype',
          'name': 'Global Search Settings',
          'label': _('Einstellungen Globale Suche')
        }
      ]
    }
  ]