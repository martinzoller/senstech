# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from . import __version__ as app_version

app_name = "senstech"
app_title = "Senstech"
app_publisher = "libracore AG"
app_description = "Senstech"
app_icon = "octicon octicon-file-directory"
app_color = "grey"
app_email = "info@libracore.com"
app_license = "MIT"

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
app_include_css = "/assets/senstech/css/senstech.css"
app_include_js = "/assets/senstech/js/senstech.js"

# include js, css files in header of web template
# web_include_css = "/assets/senstech/css/senstech.css"
# web_include_js = "/assets/senstech/js/senstech.js"

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}


# adding Jinja environments

jenv = {
	"methods": [
		"get_stock_qty:senstech.utils.check_for_batch_quick_stock_entry",
        "json_loads:senstech.utils.json_loads",
        "template_exists:senstech.utils.template_exists",
        "get_item_variant_description:senstech.utils.get_item_variant_description"
	]
}


# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
#	"Role": "home_page"
# }

# Website user home page (by function)
# get_website_user_home_page = "senstech.utils.get_home_page"

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Installation
# ------------

# before_install = "senstech.install.before_install"
# after_install = "senstech.install.after_install"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "senstech.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
#	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"senstech.tasks.all"
# 	],
# 	"daily": [
# 		"senstech.tasks.daily"
# 	],
# 	"hourly": [
# 		"senstech.tasks.hourly"
# 	],
# 	"weekly": [
# 		"senstech.tasks.weekly"
# 	]
# 	"monthly": [
# 		"senstech.tasks.monthly"
# 	]
# }

# Testing
# -------

# before_tests = "senstech.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "senstech.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "senstech.task.get_dashboard_data"
# }

fixture = [ 'Custom Script' ]
fixtures = [ 'Custom Script' ]
