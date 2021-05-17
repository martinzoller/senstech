# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from frappe import _

def get_data():
	return [
		{
			"module_name": "Senstech",
			"category": "Modules",
            "label": _("Senstech"),
			"color": "grey",
			"icon": "icon cube-blue",
			"type": "module"
		},
		{
			"module_name": "Senstech Settings",
			"category": "Modules",
            "label": _("Senstech Einstellungen"),
			"color": "grey",
			"icon": "icon settings-blue",
			"type": "module"
		}
	]
