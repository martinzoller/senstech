# Copyright (c) 2013, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
from __future__ import unicode_literals
import frappe
from frappe import _

def execute(filters=None):
	columns, data = [], []
	columns=get_columns()
	data=get_data(filters,columns)
	return columns, data

def get_columns():
	return [
		{
			"label": _("Item"),
			"fieldname": "item_code",
			"fieldtype": "Data",
			"width": 180
		},
		{
			"label": _("Item Name"),
			"fieldname": "item_name",
			"fieldtype": "Data",
			"width": 300
		},
		{
			"label": _("Warehouse"),
			"fieldname": "warehouse",
			"fieldtype": "Link",
			"options": "Warehouse",
			"width": 140
		},
		{
			"label": _("Lagerbestand"),
			"fieldname": "stock_available",
			"fieldtype": "Float",
			"width": 100
		},
		{
			"label": _("Price List"),
			"fieldname": "selling_price_list",
			"fieldtype": "Link",
			"options": "Price List",
			"width": 120
		},
		{
			"label": _("Einzelpreis"),
			"fieldname": "selling_rate",
			"fieldtype": "Currency",
			"width": 100
		},
        {
			"label": _("Gesamtpreis"),
			"fieldname": "total_price",
			"fieldtype": "Currency",
			"width": 100
		},
		{
			"label": _("Inventurwert (40%)"),
			"fieldname": "inventory_value",
			"fieldtype": "Currency",
			"width": 130
		}
	]

def get_data(filters, columns):
	item_price_qty_data = []
	item_price_qty_data = get_item_price_qty_data(filters)
	return item_price_qty_data

def get_item_price_qty_data(filters):
	conditions = ""
	if filters.get("item_group"):
		conditions += " and i.item_group=%(item_group)s"
	if filters.get("warehouse"):
		conditions += " and b.warehouse=%(warehouse)s"
	if filters.get("is_sales_item"):
		conditions += " and i.is_sales_item=1"

	item_results = frappe.db.sql("""select b.item_code, i.item_name, p.name as price_list_name,
		b.warehouse as warehouse, b.actual_qty as actual_qty
		from (`tabBin` b inner join `tabItem` i on b.item_code = i.item_code) left join `tabItem Price` p
		ON p.item_code = i.item_code
        WHERE b.actual_qty > 0
		{conditions}
        ORDER BY actual_qty DESC"""
		.format(conditions=conditions), filters, as_dict=1)

	price_list_names = list(set([item.price_list_name for item in item_results]))

	selling_price_map = get_price_map(price_list_names)

	result = []
	if item_results:
		for item_dict in item_results:
			data = {
				'item_code': item_dict.item_code,
				'item_name': item_dict.item_name,
				'warehouse': item_dict.warehouse,
				'stock_available': item_dict.actual_qty or 0,
				'selling_price_list': "",
				'selling_rate': 0.0,
                'total_price': 0.0,
                'inventory_value': 0.0,
			}

			price_list = item_dict["price_list_name"]
			if selling_price_map.get(price_list):
				data["selling_price_list"] = selling_price_map.get(price_list)["Selling Price List"] or ""
				data["selling_rate"] = selling_price_map.get(price_list)["Selling Rate"] or 0
				data["total_price"] = data["selling_rate"] * data["stock_available"]
				data["inventory_value"] = data["total_price"] * 0.4

			result.append(data)

	return result

def get_price_map(price_list_names):
	price_map = {}

	if not price_list_names:
		return price_map

	rate_key = "Selling Rate"
	price_list_key = "Selling Price List"
	price_list_condition = " and selling=1"

	pricing_details = frappe.db.sql("""
		select
			name,price_list,price_list_rate
		from
			`tabItem Price`
		where
			name in ({price_list_names}) {price_list_condition}
		""".format(price_list_names=', '.join(['%s']*len(price_list_names)),
	price_list_condition=price_list_condition), price_list_names, as_dict=1)

	for d in pricing_details:
		name = d["name"]
		price_map[name] = {
			price_list_key :d["price_list"],
			rate_key :d["price_list_rate"]
		}

	return price_map
