frappe.ui.form.on('Item', {
    before_load(frm) {
        if (cur_frm.doc.description == cur_frm.doc.item_name) {
            cur_frm.set_value('description','');
        }
    },
	refresh(frm) {
	    if (frm.doc.__islocal&&cur_frm.doc.is_purchase_item) {
		    get_next_purchase_item_number(frm);
		}
	    
		if (!frm.doc.__islocal) {
			cur_frm.fields_dict['description'].$wrapper.find('#variant_description').remove();
            if (cur_frm.doc.variant_of) {
                var variant_desc = '<div id="variant_description"><b>Variantenbeschreibung (erscheint oberhalb der Artikelbeschreibung)</b>';
                frappe.call({
                    'method': 'senstech.scripts.item_tools.get_item_variant_description',
                    'args': {
                        'item': cur_frm.doc.name
                    },
                    'callback': function(response) {
                        variant_desc += response.message + '</div>';
                        cur_frm.fields_dict['description'].$wrapper.prepend(variant_desc);
                    }
                });
            }
		    get_batch_info(frm);
			frm.add_custom_button(__("Lageretikett drucken"+(cur_frm.doc.has_variants?' (alle Varianten)':'')), function() {
				lageretikett(cur_frm.doc);
			});
			if (cur_frm.doc.is_purchase_item) {
				frm.add_custom_button(__("Nachbestellen"), function() {
					nachbestellen(frm);
				});
			}
		    item_group_filter(frm);			
		}
	},
	validate(frm) {
	    var plain_description = cur_frm.doc.description.replace('<div>','').replace('</div>','').replace('<br>','');
	    if (plain_description == '' || plain_description == '-' || plain_description == cur_frm.doc.item_code) {
	        cur_frm.set_value('description',cur_frm.doc.item_name);
	    }
	    if (cur_frm.doc.is_sales_item&&cur_frm.doc.is_purchase_item) {
	        frappe.msgprint(__("Ein Artikel darf nicht als 'Einkaufs-' wie auch 'Verkausartikel' definiert sein."), __("Validation"));
	        frappe.validated=false;
	    }
		if (cur_frm.doc.benoetigt_chargenfreigabe && !cur_frm.doc.has_batch_no) {
	        frappe.msgprint(__("Chargenfreigabe ist nur bei aktivierter Chargennummer möglich"), __("Validation"));
	        frappe.validated=false;
	    }
	    if (['Serieprodukte OEM','Eigenprodukte'].includes(frm.doc.item_group)  && !cur_frm.doc.has_batch_no) {
	        frappe.msgprint(__("Serie- und Eigenprodukte müssen eine Chargennummer haben"), __("Validation"));
	        frappe.validated = false;
	    }
	    if (cur_frm.doc.qualitaetsspezifikation && cur_frm.doc.qualitaetsspezifikation != '<div><br></div>'  && !cur_frm.doc.benoetigt_chargenfreigabe) {
	        frappe.msgprint(__("Ein COC kann nur bei freigegebenen Chargen erzeugt werden. Bitte Chargenfreigabe aktivieren oder Qualitätsspezifikation leer lassen."), __("Validation"));
	        frappe.validated = false;
	    }
	    if (frm.doc.__islocal&&frm.doc.is_purchase_item&&frm.doc.item_code=='') {
		    get_next_purchase_item_number(frm);
		}
		
		if (frm.doc.item_group) {
    		frappe.db.get_doc("Item Group", frm.doc.item_group).then( grp => {
    		   if (frm.doc.is_purchase_item && grp.parent_item_group != 'Einkauf') {
    		     frappe.msgprint(__("Die Artikelgruppe '"+frm.doc.item_group+"' ist nicht für Einkaufsartikel vorgesehen. Bitte eine andere Gruppe auswählen."), __("Validation"));
    	         frappe.validated=false;
    		   }
    		   if (frm.doc.is_sales_item && grp.parent_item_group != 'Verkauf') {
    		     frappe.msgprint(__("Die Artikelgruppe '"+frm.doc.item_group+"' ist nicht für Verkaufsartikel vorgesehen. Bitte eine andere Gruppe auswählen."), __("Validation"));
    	         frappe.validated=false;
    		   }
    		});
		}
	},
	copy_of_has_batch_no(frm) {
		cur_frm.set_value('has_batch_no', cur_frm.doc.copy_of_has_batch_no);
	},
	artikelcode_kunde(frm) {
		cur_frm.set_value('artikelcode_kunde_als_barcode', cur_frm.doc.artikelcode_kunde);
	},
	artikelcode_kunde_als_barcode(frm) {
		cur_frm.set_value('artikelcode_kunde_als_barcode_raw', cur_frm.doc.artikelcode_kunde_als_barcode);
	},
	is_purchase_item(frm) {
		if (frm.doc.__islocal&&frm.doc.is_purchase_item&&frm.doc.item_code=='') {
		    get_next_purchase_item_number(frm);
		}
		else if (frm.doc.__islocal&&!frm.doc.is_purchase_item&&frm.doc.item_code.substring(0, 3)=='PT-') {
		    frm.set_value('item_code','');
		}
		item_group_filter(frm);
	},
	is_sales_item(frm) {
	    item_group_filter(frm);
	},
	item_code(frm) {
	    if (frm.doc.item_name == frm.doc.item_code) {
	        frm.set_value('item_name','')
	    }
	    if (frm.doc.description == frm.doc.item_code) {
	        frm.set_value('description','')
	    }	    
	},
	after_save(frm) {
        if (cur_frm.doc.description == cur_frm.doc.item_name) {
            cur_frm.set_value('description','');
        }
    },
});

function get_batch_info(frm) {
    frappe.call({
    	'method': 'senstech.scripts.item_tools.get_batch_info',
    	'args': {
    		'item_code': cur_frm.doc.item_code
    	},
        'callback': function(response) {
            var batches = response.message;
            if ((batches) && (batches.length > 0)) {
                var html = "<table class=\"table\" style=\"width: 100%;\">";
                html += "<tr><th>" + __("Batch") 
                        + "</th><th>" + __("Qty") 
                        + "</th></tr>";
                for (var i = 0; i < batches.length; i++) {
                    html += ("<tr><td><a href=\"/desk#Form/Batch/" 
                         + batches[i].batch_no 
                         + "\">" + batches[i].batch_no 
                         + "</a></td><td>" 
                         + batches[i].qty + " " + batches[i].stock_uom + "</td>");
                }
                html += "</table>";
                cur_frm.set_df_property('batch_overview_html','options',html);
            } else if (batches) {
                cur_frm.set_df_property('batch_overview_html','options',__("No batches available."));
            }
        }
    });
}

function get_next_purchase_item_number(frm) {
	frappe.call({
    	'method': 'senstech.scripts.item_tools.get_next_purchase_item_number',
    	'callback': function(response) {
            var next_number = response.message;
            if (next_number) {
                cur_frm.set_value('item_code', next_number);
            }
        }
    });
}

function item_group_filter(frm) {
    var groupfilters;
    if (frm.doc.is_purchase_item) {
        if(frm.doc.is_sales_item) {
            groupfilters = {};
        }
        else {
            groupfilters = { parent_item_group: 'Einkauf' };
        }
    }
    else {
        groupfilters = { parent_item_group: 'Verkauf' }
    }
    
    frm.set_query('item_group', () => {
        return {
            filters: groupfilters
        }
    });
}

function nachbestellen(frm) {
	if (cur_frm.doc.supplier_items.length < 1) {
		frappe.msgprint(__("Es ist kein Standard-Lieferant hinterlegt"), __("Fehlender Lieferant"));
	} else if (cur_frm.doc.supplier_items.length == 1) {
		_nachbestellen(frm, cur_frm.doc.supplier_items[0].supplier, cur_frm.doc.supplier_items[0].order_qty)
	} else {
		var lieferanten = '';
		cur_frm.doc.supplier_items.forEach(function(entry) {
			lieferanten += entry.supplier + "\n";
		});
		frappe.prompt([
			{'fieldname': 'supplier', 'fieldtype': 'Select', 'label': __("Supplier"), 'reqd': 1, 'options': lieferanten}  
		],
		function(values){
			var lieferant = values.supplier;
			var qty = 0;
			cur_frm.doc.supplier_items.forEach(function(entry) {
				if (entry.supplier == lieferant) {
					qty = entry.order_qty;
				}
			});
			_nachbestellen(frm, lieferant, qty)
		},
		__("Auswahl Lieferant"),
		__("Weiter")
		)
	}
}

function _nachbestellen(frm, supplier, qty) {
	frappe.call({
    	'method': 'senstech.scripts.item_tools.nachbestellung',
    	'args': {
    		'item': cur_frm.doc.name,
			'supplier': supplier,
			'qty': qty,
			'taxes': 'Vorsteuerfrei - ST'
    	},
		'callback': function(response) {
			frappe.set_route('Form', 'Purchase Order', response.message);
		}
    });
}

function lageretikett(item_doc) {
	frappe.call({
    	'method': 'senstech.scripts.tools.direct_print_doc',
    	'args': {
			'doctype': 'Item',
    		'name': item_doc.name,
			'print_format': 'Item Label ST',
			'printer_name': 'Zebra 57x32'
    	},
		'callback': function(response) {
		}
    });
}