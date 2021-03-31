from __future__ import unicode_literals
from frappe import _

def get_data():
    return[
		{
			"label": _("Settings"),
			"icon": "fa fa-cog",
			"items": [
			   {
				   "type": "doctype",
				   "name": "Einstellungen Dokumentation",
				   "label": _("Senstech Wiki"),
				   "description": _("Einstellungen Dokumentation (Senstech Wiki)")
			   },
			   {
				   "type": "doctype",
				   "name": "Senstech Berg",
				   "label": _("Senstech Berg"),
				   "description": _("Liste von Bergen für Projektnamen")
			   },
			   {
				   "type": "doctype",
				   "name": "Senstech Einstellungen",
				   "label": _("Senstech Einstellungen"),
				   "description": _("Einstellungen für Senstech-spezifische Funktionen")
			   }
			]
		}
	]
