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
			   }
			]
		}
	]
