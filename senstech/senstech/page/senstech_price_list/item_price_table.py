from __future__ import unicode_literals

import frappe
from frappe.model.db_query import DatabaseQuery

@frappe.whitelist()
def get_data(price_list=None, item_code=None, item_group=None, start=0, sort_by='item_name', sort_order='asc'):
    if not (price_list or item_code or item_group):
        return {}

    if price_list:
        is_purchase_price_list = frappe.db.get_value("Price List", price_list, "buying") or False
    
    if item_code:
        where_clause = "(item_code='{item_code}' OR variant_of='{item_code}')".format(item_code=item_code)
        item_group, is_purchase_item, is_sales_item = frappe.db.get_value("Item", item_code, ["item_group", "is_purchase_item", "is_sales_item"]) or ['',False,False]
        has_list_price = frappe.db.get_value("Item Group", item_group, "has_list_price")
    elif item_group:
        lft, rgt, has_list_price, parent_item_group = frappe.db.get_value("Item Group", item_group, ["lft", "rgt", "has_list_price", "parent_item_group"]) or [0,0,False,""]
        is_purchase_item = (parent_item_group == 'Einkauf')
        is_sales_item = (parent_item_group == 'Verkauf')
        # This method will include all items in subgroups of the selected item group, not just direct members
        items = frappe.db.sql_list("""
            select i.name from `tabItem` i
            where exists(select name from `tabItem Group`
                where name=i.item_group and lft >=%s and rgt<=%s)
        """, (lft, rgt))
        where_clause = "item_code IN {ic_list}".format(ic_list=tuple(items))
    elif price_list:
        is_purchase_item, is_sales_item = is_purchase_price_list, not is_purchase_price_list
        where_clause = """is_purchase_item = '{ipi}' AND is_sales_item = '{isi}' """.format(ipi=int(is_purchase_item), isi=int(is_sales_item))
    
    # Set price list to default if its 'buying' field doesn't match the item or item group, or if no price list is given
    if item_group:
        if is_sales_item and (not price_list or is_purchase_price_list):
            price_list = frappe.defaults.get_global_default('selling_price_list')
        if is_purchase_item and (not price_list or not is_purchase_price_list):
            price_list = frappe.defaults.get_global_default('buying_price_list')
            
    # Return empty set if item group doesn't have list prices (also applies in single-item mode)
    if item_group and not has_list_price:
        return {
            'price_list': price_list,
            'has_list_price': False,
            'is_purchase_item': is_purchase_item,
            'is_sales_item': is_sales_item,
            'data': [],
        }
    
    price_list_currency = frappe.db.get_value("Price List", price_list, ["currency"])
    # Invalid price list
    if not price_list_currency:
        return {
            'price_list': price_list,
            'has_list_price': True,
            'data': [],
        }    

    if(sort_by.startswith('price_')):
        # Since the price can be a string in case of errors ("non-unique!"), make sure it gets sorted as a number
        sort_by = 'CAST({sort_by} AS DOUBLE)'.format(sort_by=sort_by)
    price_data = frappe.db.sql("""
    SELECT
      item_code,
      item_name,
      (SELECT IF(COUNT(*)>1, 'non-unique!', price_list_rate) FROM `tabItem Price` WHERE item_code = `tabItem`.item_code AND min_qty =  1 AND price_list = '{price_list}') price_1,
      (SELECT IF(COUNT(*)>1, 'non-unique!', price_list_rate) FROM `tabItem Price` WHERE item_code = `tabItem`.item_code AND min_qty = 10 AND price_list = '{price_list}') price_10,
      (SELECT IF(COUNT(*)>1, 'non-unique!', price_list_rate) FROM `tabItem Price` WHERE item_code = `tabItem`.item_code AND min_qty = 20 AND price_list = '{price_list}') price_20,
      (item_group LIKE 'Eigenprodukte%') has_price_breaks
    FROM
      `tabItem`
    WHERE
      {where_clause}
      AND disabled=0 AND has_variants=0
    ORDER BY {sort_by} {sort_order}
    LIMIT {start},101
    """.format(price_list=price_list, where_clause=where_clause, sort_by=sort_by, sort_order=sort_order, start=start), as_dict=True)

    return {
        'data': price_data,
        'price_list': price_list,
        'has_list_price': True,
        'currency': price_list_currency,
        'is_purchase_item': is_purchase_item,
        'is_sales_item': is_sales_item,
    }


@frappe.whitelist()
def set_item_price(price_list, item_code, min_qty, rate):
    if frappe.has_permission("Item Price", "write"):
        if int(min_qty) in [1, 10, 20]:
            # Delete and reinsert price to eliminate any duplicates (which do seem to occur!)
            frappe.db.sql("""
                DELETE FROM `tabItem Price`
                WHERE item_code='{item_code}'
                  AND price_list='{price_list}'
                  AND min_qty='{min_qty}'
            """.format(item_code=item_code, price_list=price_list, min_qty=min_qty))
            # If price is zero/empty, leave it out of the list
            if float(rate)>0:
                pl_currency = frappe.db.get_value("Price List", price_list, "currency")
                item_price = frappe.get_doc({
                    "doctype": "Item Price",
                    "price_list": price_list,
                    "item_code": item_code,
                    "min_qty": int(min_qty),
                    "currency": pl_currency,
                    "price_list_rate": float(rate)
                })
                item_price.insert()
            frappe.db.commit()
            return "success"
        else:
            frappe.throw(_("Invalid price or price break"))
    else:
        frappe.throw(_("User has no permission to write Item Price"))