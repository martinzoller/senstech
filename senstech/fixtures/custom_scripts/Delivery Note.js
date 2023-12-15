frappe.ui.form.on('Delivery Note', {
    before_save(frm) {
		if (!frm.doc.taxes_and_charges) {
		    fetch_taxes_and_charges_from_customer(frm);
		}
	},
    validate(frm) {
		basic_common_validations(frm);
	    check_item_links(frm);
        reload_contacts(frm);
    },
	onload(frm) {
		project_query(frm);
	},
	onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
        // "In Worten" auch nicht
        jQuery('div[data-fieldname="base_in_words"]').hide();
    },
    customer(frm) {
        if (!frm.doc.taxes_and_charges) {
            setTimeout(function(){
                fetch_taxes_and_charges_from_customer(frm);
            }, 1000);
        }
    },
    refresh(frm) {
        if (frm.doc.customer_address && frm.doc.shipping_address_name) {
            update_address_display(frm, ['address_display', 'shipping_address'], [frm.doc.customer_address, frm.doc.shipping_address_name], true);
        } else {
            if (frm.doc.customer_address) {
                update_address_display(frm, 'address_display', frm.doc.customer_address, false);
            }
            if (frm.doc.shipping_address_name) {
                update_address_display(frm, 'shipping_address', frm.doc.shipping_address_name, false);
            }
        }
        frm.add_custom_button(__("Label Verpackungseinheit"), function() {
            create_label(frm);
        });
    },
    before_submit(frm) {
        frm.doc.submitted_by = frappe.user.name;
    },
    after_cancel(frm) {
        add_cancelled_watermark(frm);
    }
});

frappe.ui.form.on('Delivery Note Item', {
    item_code: function(frm) {
		// Popup für Chargenauswahl ausblenden (erscheint ansonsten gefühlt genau dann nicht, wenn man es braucht, und umgekehrt...)
        frappe.flags.hide_serial_batch_dialog = true;
		// TODO: schauen, wie man die Hinweismeldung wegkriegt, dass es von keiner Charge genügend Stück hat - oder diese in ein unobtrusive popup notice verwandeln. Ebenso möglichst nicht automatisch die erstbeste Charge zuweisen!
		// Evtl stattdessen einen Button machen, um Chargen zuzuweisen, oder dies sogar automatisch beim Laden eines neuen Dokuments tun - jeweils älteste mit Lagerbestand und so viele wie nötig, um die Gesamtzahl zu erreichen (automatisch Zeile duplizieren).
		// Vielleicht kann man ein Override für die Funktion machen, welche aktuell die doofe Meldung anzeigt?!
    },	
    sensor_ids: function(frm, cdt, cdn) {
		var current_item = locals[cdt][cdn];
		var num_sensors_text = __('Anzahl Sensoren in der Liste:')+' '
		
		if(!current_item.item_code) {
			frappe.msgprint(__("Bitte zuerst einen Artikel wählen"), __("Fehler"));
		}
        
        let d = new frappe.ui.Dialog({
			fields: [
				{'fieldname': 'item_code', 'fieldtype': 'Link', 'options': 'Item', 'default': current_item.item_code, 'read_only': 1, 'label': __('Artikel')},
				{'fieldname': 'batch_no', 'fieldtype': 'Link', 'options': 'Batch', 'default': current_item.batch_no, 'get_query': function() {
					let filters = {
						'item_code': current_item.item_code,
						'posting_date': frm.doc.posting_date || frappe.datetime.nowdate(),
					}
					if (current_item.warehouse) filters["warehouse"] = current_item.warehouse;
					return {
						query : "erpnext.controllers.queries.get_batch_no",
						filters: filters
					}
				}, 'reqd': 1, 'label': __('Produktionscharge'),'onchange': function() {
					d.fields_dict.sensor_ids.set_value('');
				}},
				{'fieldname': 'qty', 'fieldtype': 'Int', 'default': current_item.qty, 'reqd': 1, 'label': __('Stückzahl')},
				{'fieldname': 'sensor_ids', 'fieldtype': 'Text', 'reqd': 0, 'label': __('Sensor-IDs (kommagetrennt)'), 'onchange': function() {
					var ids = d.fields_dict.sensor_ids.get_value();
					var n_sensors = 0;
					if(ids) {
						n_sensors = (ids.split(',')).length
					}
					d.fields_dict.sensor_ids.set_description(num_sensors_text+n_sensors);
				}},
				{'fieldname': 'add_sensor_id', 'fieldtype': 'Small Text', 'reqd': 0, 'label': __('Sensor hinzufügen (Barcodescanner)')},
			],
			primary_action: function(values) {
				var ids = '';
				if(values.sensor_ids) {
					ids = values.sensor_ids.split(',');
					if(ids.length != d.fields_dict.qty.get_value()) {
						frappe.msgprint(__("Die Anzahl Sensor-IDs stimmt nicht mit der Stückzahl überein"),__("Fehler"));
						return;
					}
					
					var find_duplicates = arr => arr.filter((item, index) => arr.indexOf(item) !== index);
					var duplicates = find_duplicates(ids);
					if(duplicates.length > 0) {
						frappe.msgprint(__("Die Liste der Sensor-IDs enthält Duplikate:")+" "+duplicates.join(','));
						return;
					}
					
					for(var i=0;i<ids.length;i++){
						var int_id = parseInt(ids[i]);
						if(int_id == 0 || Number.isNaN(int_id)) {
							frappe.msgprint(__("Ungültige Sensor-ID: ")+ids[i],__("Fehler"));
							return;
						}
						ids[i] = String(int_id).padStart(4,'0');
					}
					ids = ids.join(',');
				}
				
				d.hide();
				current_item.sensor_ids_list = ids;
				current_item.item_code = values.item_code;
				current_item.batch_no = values.batch_no;
				current_item.qty = values.qty;
				frm.dirty(true);
				frm.refresh_fields(['items']);
			},
			primary_action_label: __('Speichern')
        });
		d.fields_dict.add_sensor_id.wrapper.onkeypress = function(e) {
			if(e.key=="Enter") {
				e.preventDefault();
				var cur_batch = d.fields_dict.batch_no.get_value();
				var cur_item = d.fields_dict.item_code.get_value();
				var barcode_value = d.fields_dict.add_sensor_id.get_value();
				d.fields_dict.add_sensor_id.set_value('');				
				if(!barcode_value) return;
				var new_sensor_id = barcode_value.split("\n")[0];
				if(new_sensor_id.startsWith(cur_batch+'/')){
					var sensors_str = d.fields_dict.sensor_ids.get_value();
					var new_sensor_number = new_sensor_id.substr(cur_batch.length + 1);
					var conditional_comma = [',',''].includes(sensors_str.substr(-1)) ? '' : ',';
					d.fields_dict.sensor_ids.set_value(sensors_str+conditional_comma+new_sensor_number);
				}
				else {
					if(new_sensor_id.startsWith(cur_item)){
						frappe.msgprint(__("Produktionscharge stimmt nicht mit der gewählten Charge überein."),__("Ungültige Sensor-ID"));
					}
					else {
						frappe.msgprint(__("Artikel stimmt nicht mit dem gewählten Artikel überein."),__("Ungültige Sensor-ID"));
					}
				}
			}
		}
		d.fields_dict.sensor_ids.set_value(current_item.sensor_ids_list); // Nicht als default, sondern im Nachhinein setzen, damit onchange triggert
        d.show();
		setTimeout(function() {
            d.fields_dict.add_sensor_id.set_focus(); // Barcodescanner-Feld aktivieren
        }, 500);
    },
	items_add: function(frm, cdt, cdn) {
		set_position_number(frm, cdt, cdn);
   }
});


function fetch_taxes_and_charges_from_customer(frm) {
	if(!frm.doc.customer) {
		return;
	}
	frappe.call({
		"method": "frappe.client.get",
		"args": {
			"doctype": "Customer",
			"name": frm.doc.customer
		},
		"callback": function(response) {
			var customer = response.message;
			
			if(customer.taxes_and_charges) {
				frm.set_value('taxes_and_charges', customer.taxes_and_charges);
			}
		}
	});
}


function create_label(frm) {
    var label_printer = "Zebra 57x32"; 
    var contents = get_label_content(frm); 
    frappe.call({
        "method": "senstech.scripts.delivery_note_tools.print_multiple_label_pdf",
        "args": {
            "printer_name": label_printer,
            "contents": contents
        },
        "freeze": true,
        "freeze_message": 'Erstelle Labelserie...',
        "callback": function(response) {
            var msg = response.message;
        }
    });
}

function get_label_content(frm) {
    var items = frm.doc.items;
    var content = [];
    items.forEach(function(entry) {
       if (entry.chargennummer) {
        content.push([entry.item_code, entry.qty, entry.chargennummer]);
       }
    });
    return content;
}


// Warnung anzeigen, wenn einzelne Positionen (ausser Versandkosten) nicht mit einem Sales Order
// verknüpft sind, obwohl grundsätzlich ein verknüpfter Sales Order existiert
function check_item_links(frm) {
    var has_so_link = false;
    var unlinked_pos = -1;
    frm.doc.items.forEach(function(entry) {
       if(entry.against_sales_order) {
           has_so_link = true;
       }
       if(entry.item_group != "Versandkosten" && !entry.against_sales_order) {
           unlinked_pos = entry.position;
       }
    });
    if(has_so_link && unlinked_pos >= 0) {
        if(typeof check_item_links.confirmed_dn == 'undefined' || check_item_links.confirmed_dn != frm.docname) {
            frappe.validated = false;
            frappe.confirm( __("Warnung: Mindestens ein Artikel (Pos. "+unlinked_pos+") ist nicht mit einer Kunden-AB verknüpft. Speichern fortsetzen?"),
            () => {
                // action to perform if Yes is selected
                check_item_links.confirmed_dn = frm.docname;
                frm.save();
            },
            () => {
                // action to perform if No is selected
                frm.scroll_to_field('items');
            });
        }
    }
}