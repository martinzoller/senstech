/*
 * common_st.js: Functions used in several doctype specific scripts
 */
 
 function set_position_number(frm, cdt, cdn) {
	let current_item = locals[cdt][cdn];
	let row_count = frm.doc.items.length;
	let pos_step;
	if (row_count == current_item.idx) {
		pos_step = 10;
	} else {
		pos_step = 1;
	}
	let new_pos = pos_step;
	
	if (current_item.idx > 1) {
		// Assign position based on previous row
		let prev_item = frm.fields_dict.items.grid.get_data()[current_item.idx - 2];
		new_pos = parseInt(prev_item.position) + pos_step;
		if(frm.doc.items.some(f => f.position == new_pos)) {
			// Position exists: Assign a non-consecutive position number (largest existing position plus 1)
			new_pos = Math.max(...frm.doc.items.map(f => f.position)) + 1;
		}
	}
	
	frappe.model.set_value(cdt, cdn, 'position', new_pos);
}


// In a local document, make sure that every row has a valid position number, e.g. when rows have been fetched from a Blanket Order
function fix_position_numbers(frm) {
	let grid_data = frm.fields_dict.items.grid.get_data();
	let prev_pos = 0;
	for(var i = 0; i < grid_data.length; i++) {
		let new_pos = prev_pos + 10;
		if(!grid_data[i].position) {
			if(i < grid_data.length - 1 && grid_data[i+1].position && grid_data[i+1].position <= new_pos) {
				let new_pos = prev_pos + 1;
				if(grid_data[i+1].position <= new_pos) {
					new_pos = Math.max(...grid_data.map(f => f.position)) + 1;
				}
			}
			frappe.model.set_value(grid_data[i].doctype, grid_data[i].name, "position", new_pos);
			prev_pos = new_pos;
		} else {
			prev_pos = grid_data[i].position;
		}
	}
}


function add_cancelled_watermark(frm) {
    frappe.call({
        "method": "senstech.scripts.tools.add_cancelled_watermark",
        "args": {
            "dt": frm.doctype,
            "dn": frm.docname
        },
        "callback": function(response) {
            frm.reload_doc();
        }
    });
}

function update_address_display(frm, fields, addresses, as_list=false) {
    if (!as_list) {
        as_list = '';
    }
    frappe.call({
        "method": "senstech.scripts.tools.update_address_display",
        "args": {
            "doctype": frm.doctype,
            "doc_name": frm.docname,
            "fields": fields,
            "addresses": addresses,
            'as_list': as_list
        },
        "callback": function(response) {
            var response = response.message;
            if (!as_list) {
                if (response == 'updated') {
                    frm.reload_doc();
                }
            } else {
				if (response.includes('updated')) {
                    frm.reload_doc();
                }
            }
        }
    });
}

// Applies for: Purchasing docs (RQ, PO, PR, PI), Sales docs (QN, SO, SI, BO) and DN
function basic_common_validations(frm) {
	if (!frm.doc.taxes_and_charges && frm.doctype != "Request for Quotation") {
		validation_error(frm, 'taxes_and_charges', __("Bitte Vorlage für Steuern und Abgaben hinterlegen"));
	}

	// TODO: Blanket Order doesn't have a position number, but there isn't a good reason why it should not
	if(! ["Blanket Order", "Purchase Receipt"].includes(frm.doctype)) {
		let pos_numbers = [];
		frm.doc.items.forEach(function(entry) {
			entry.copy_of_stock_uom = entry.stock_uom;
			entry.qty_in_stock_uom = entry.stock_qty;
			if(text_field_empty(entry.description)){
				entry.description = entry.item_name;
			}
			if(pos_numbers.includes(entry.position)) {
				validation_error(frm, 'items', __("Doppelte Positionsnummer:")+" "+entry.position);
			}
			else if(entry.position === 0) {
				validation_error(frm, 'items', __("Positionsnummern müssen grösser Null sein"));
			}
			pos_numbers.push(entry.position);   
		});
	}
}


// Applies for: RQ, PO, PR, PI
function basic_purchasing_validations(frm) {
	basic_common_validations(frm);
}


// Applies for: QN, SO, SI, BO
function basic_sales_validations(frm) {
	basic_common_validations(frm);
	let payment_terms_field = (frm.doctype=='Blanket Order'?'payment_terms':'payment_terms_template');
	if (!frm.doc[payment_terms_field]) {
		validation_error(frm, payment_terms_field, __("Vorlage Zahlungsbedingungen muss ausgewählt werden"));
	}
	
	// EORI number validations (Territory dependent)
	if(!frm.doc.eori_number && frm.doc.territory != "Schweiz" && ! ["Quotation", "Delivery Note"].includes(frm.doctype)) {
		frappe.db.get_value("Territory", frm.doc.territory, "parent_territory").then(r => {
			if(r.message && r.message.parent_territory == 'Europa') {
				if(frm.doctype == 'Sales Invoice') {
					validation_error(frm, 'customer', __('Im Kundenstamm ist keine EORI-Nummer hinterlegt. Für den Versand an EU-Kunden ist diese zwingend erforderlich.')+'<br><br><a href="#Form/Customer/'+frm.doc.customer+'" target="_blank">&gt; '+__('Zum Kunden:')+' '+frm.doc.customer_name+'</a>');
				} else {
					frappe.show_alert({message: __('Im Kundenstamm ist keine EORI-Nummer hinterlegt. Bitte diese beim Kunden anfordern, damit eine Rechnung erstellt werden kann!')+'<br><br><a href="#Form/Customer/'+frm.doc.customer+'" target="_blank">&gt; '+__('Zum Kunden:')+' '+frm.doc.customer_name+'</a>', indicator: 'orange'}, 30);
				}
			}
		});
	}
	
	// Validation of generic development & contract manufacturing items
	if(frm.doc.items.some(i => ['GP-00001','GP-00003'].includes(i.item_code)) && frm.doc.items.some(f => f.item_code=='GP-00002')) {
		validation_error(frm, 'items', __("Ein Verkaufsdokument darf nicht gleichzeitig Entwicklung und Lohnfertigung/Kleinaufträge enthalten. Bitte zwei separate Dokumente anlegen."));
	}
	if(['Quotation','Sales Order'].includes(frm.doctype)) {
		if(frm.doc.items.some(f => f.item_code=='GP-00011') && !frm.doc.items.some(f => f.item_code=='GP-00001')) {
			validation_error(frm, 'items', __("Der Prototypen-Artikel GP-00011 darf nur in Kombination mit einem Entwicklungsauftrag GP-00001 offeriert oder bestellt werden"));
		}
		if(frm.doc.items.some(f => f.item_code=='GP-00012') && !frm.doc.items.some(f => f.item_code=='GP-00002')) {
			validation_error(frm, 'items', __("Die Pauschale GP-00012 darf nur in Kombination mit einem Lohnfertigungs- oder Kleinauftrag GP-00002 offeriert oder bestellt werden"));
		}
	}
	if(!frm.doc.project && frm.doctype != 'Quotation' && frm.doc.items.some(i => ['GP-00001','GP-00003'].includes(i.item_code))) {
		validation_error(frm, 'project', __("Allen Verkaufsdokumenten mit Entwicklungspositionen muss ein Projekt zugewiesen sein"));
	}
	
	// Validation of shipping fees and other line item specific requirements
	let processed_count = 0;
	let found_count = 0;
	let items = frm.doc.items;
	items.forEach(function(entry) {
		if(['GP-00001','GP-00003'].includes(entry.item_code) && entry.qty != 1) {
			validation_error(frm, 'items', __("Entwicklungsaufträge können nicht in mehrfacher Stückzahl auftreten. Zur Auslieferung oder Verrechnung von Prototypen bitte den Artikel GP-00011 verwenden; für Nullserien den entsprechenden Serieartikel anlegen."));
		}
		if (entry.item_group) {
			processed_count++;
			if (entry.item_group == 'Versandkosten') {
				found_count++;
			}
			if(processed_count == items.length && found_count != 1) {
				validation_error(frm, 'items', __("Bitte genau einmal Versandkosten/Lieferkonditionen hinterlegen"));
			}
		}
		else {
			// Documents with "local" items (no item group available): Fetch item group from server
			// This is to avoid validation errors when creating a Sales Order from a Blanket Order
			frappe.db.get_value('Item',entry.item_code,'item_group').then(r => {
				processed_count++;
				if (r.message && r.message.item_group == 'Versandkosten') {
					found_count++;
				}
				if(processed_count == items.length && found_count != 1) {
					validation_error(frm, 'items', __("Bitte genau einmal Versandkosten/Lieferkonditionen hinterlegen"));
				}
			});
		}
	});
}


function update_customer_data(frm) {
	frappe.db.get_doc("Customer", frm.doc.customer).then(cust => {
		if(cust && !cust.payment_terms) {
			frappe.db.set_value("Customer", frm.doc.customer, "payment_terms", frm.doc.payment_terms_template).then(r => {
				frappe.show_alert({message: __('Zahlungsbedingungen im Kundenstamm gespeichert:')+' '+frm.doc.payment_terms_template, indicator: 'green'}, 5);
			});
		}
	});	
}


function fetch_taxes_and_charges_from_supplier(frm) {
	if(!frm.doc.supplier) {
		return;
	}
	frappe.call({
		"method": "frappe.client.get",
		"args": {
			"doctype": "Supplier",
			"name": frm.doc.supplier
		},
		"callback": function(response) {
			var supplier = response.message;

			if (supplier.taxes_and_charges) {
				frm.set_value('taxes_and_charges', supplier.taxes_and_charges);
			}
		}
	});
}


function reload_contacts(frm) {
	var contact = frm.doc.contact_person;
	frm.set_value("contact_person", "");
	frm.set_value("contact_person", contact);
}


function validation_error(frm, field, message) {
	frappe.msgprint(message, __("Validation") );
	if(frappe.validated) {
		frappe.validated = false;
		if(field == 'items') {
			// Workaround as scroll_to_field() doesn't work properly in this case
			frappe.utils.scroll_to(frm.fields_dict.items.$wrapper);
		} else {
			frm.scroll_to_field(field);
		}
	}
}

function validation_require(frm, field, message) {
	if(!frm.doc[field]) {
		validation_error(frm, field, message);
		return false;
	}
	return true;
}

function doc_preview_dialog(frm, callback, dialog_title = __("Dokumentvorschau"), button_text = __("OK"), fullscreen = false, cancel_callback = false) {
    
    var pdf_uri = 
		'%2Fapi%2Fmethod%2Ffrappe.utils.print_format.download_pdf%3Fdoctype%3D'
		+encodeURIComponent(frm.doctype)
		+'%26name%3D'
		+encodeURIComponent(frm.docname)
		+'%26format%3D'
		+encodeURIComponent(frm.doctype)
		+'%20ST%26no_letterhead%3D0%26_lang%3D'+(frm.doc.language || "de");
    var pdf_preview = new frappe.ui.Dialog({
		title: dialog_title,
		fields: [
			{
			    fieldtype: "HTML",
			    options: '<iframe style="width: 100%;height: calc(100vh - 160px);" src="/assets/senstech/pdfjs/web/viewer.html?file='+pdf_uri+'#zoom=page-fit"></iframe>'
			}
		],
		primary_action_label: button_text,
		primary_action: function() {
		    pdf_preview.hide();
			if(fullscreen) {
				document.exitFullscreen();
			}
			callback(frm);
		},
		secondary_action_label: __("Abbrechen"),
		secondary_action: function() {
			if(fullscreen) {
				document.exitFullscreen();
			}
			cancel_callback && cancel_callback(frm);
		}
	});
	pdf_preview.show();
	let modal_elem = pdf_preview.$wrapper.find(".modal-dialog");
	modal_elem.css("min-width","80%");
	if(fullscreen) {
		// ugly, but if we use $.when(...) to wait until the dialog is showing, the fullscreen request is denied...
		setTimeout(function() {
			modal_elem[0].requestFullscreen();
		}, 500);
	}
}

function project_query(frm) {
	if(frm.doc.customer) {
		frm.set_query('project', () => {
			return {
				filters: {
					name: ['LIKE','%-'+frm.doc.customer.substr(5,3)+'-%'],
					project_type: 'Extern'
				}
			};
		});
	}
	else {
		frm.set_query('project', () => {
			return {
				filters: { project_type: 'Extern' }
			};
		});
	}
};

function text_field_empty(val) {
	return !val || val == '<div><br></div>';
}

function update_list_prices(frm) {
	let buying_or_selling = frm.doc.selling_price_list ? 'selling' : 'buying';
	let price_list_field = buying_or_selling+'_price_list';
	// Never update list prices when we don't have a matching price list for the document's currency
	if(frm.doc.currency != frappe.sys_defaults.currency && frm.doc[price_list_field] == frappe.sys_defaults[price_list_field]) {
		return;
	}
	
	let processed_count = 0;
	let dialog_items = [];
	frm.doc.items.forEach(function(item, idx) {
		frappe.db.get_doc('Item Group',item.item_group).then(item_grp => {
			// Ignore items with blanket order references and item groups without list prices
			if (!item.blanket_order && item_grp.has_list_price && item.rate != item.price_list_rate && item.rate != 0) {
				dialog_items.push(idx)
			}

			// Detect when we are done with all items
			processed_count++;
			if(processed_count == frm.doc.items.length && dialog_items.length > 0) {
				update_list_prices_show_dialog(frm, dialog_items);
			}
		});
	});
}

function update_list_prices_show_dialog(frm, dialog_items) {
	let table_rows = '';
	frm.doc.items.forEach(function(item, idx) {
		if(dialog_items.includes(idx)) {
			table_rows += `
				<div class="list-item-container">
					<div class="list-item">
						<div class="list-item__content" style="flex: 0 0 10px;"><input type="checkbox" data-row="${idx}" ${(item.item_group.startsWith('Eigenprodukte') ? 'class="no-select" style="visibility:hidden"' : 'class="row-select"')}></div>
						<div class="list-item__content ellipsis"><span class="ellipsis">${item.item_code}</span></div>
						<div class="list-item__content ellipsis"><span class="ellipsis">${item.item_name}</span></div>
						<div class="list-item__content" style="flex: 0 0 60px;">${(item.item_group.startsWith('Eigenprodukte') ? '<span class="ellipsis">'+__('Staffelpreise')+'<br><b><a href="desk#senstech_price_list?item_code='+item.item_code+'" target="_blank">&gt; '+__('Anpassen')+'</a></b></span>' : item.price_list_rate.toFixed(2))}</div>
						<div class="list-item__content" style="flex: 0 0 30px;">${item.rate.toFixed(2)}</div>
					</div>
				</div>
			`;
		}
	});
	
	// Note: The data table in this dialog is designed to look similar to a frappe.ui.MultiSelectDialog.
	//       We are not using a MultiSelectDialog as that seems to be quite limited in functionality, e.g.
	//       it seems to always show a document name and date, both of which do not make sense for an item table
	//       (doc name will be an alphanumeric code, and date will be the same for all entries)
	let list_prices_dialog = new frappe.ui.Dialog({
		title: __('Artikelpreise speichern'),
		fields: [
			{
				'fieldname': 'price_intro',
				'fieldtype': 'HTML',
				'options': __('Die Preise für einen oder mehrere Artikel entsprechen nicht dem hinterlegten Listenpreis. <strong>Soll die Preisliste angepasst werden?</strong> Bitte Artikel auswählen, deren Listenpreis aktualisiert werden soll.'),
			},
			{
				fieldname: 'data_table',
				fieldtype: 'HTML',
				options: `
					<div class="results" style="border: 1px solid #d1d8dd; border-radius: 3px;">
						<div class="list-item list-item--head">
							<div class="list-item__content" style="flex: 0 0 10px;">
								<input type="checkbox" id="select_all">
							</div><div class="list-item__content ellipsis">
								<span class="ellipsis">${__('Artikelcode')}</span>
							</div><div class="list-item__content ellipsis">
								<span class="ellipsis">${__('Artikelbezeichnung')}</span>
							</div><div class="list-item__content" style="flex: 0 0 60px;">
								${__('Listenpreis')}
							</div><div class="list-item__content" style="flex: 0 0 30px;">
								${__('Preis')}
							</div>
						</div>
						${table_rows}
					</div>
				`
			}
		],
		primary_action_label: __('Markierte Preise speichern'),
		secondary_action_label: __('Preisliste nicht anpassen'),
		primary_action(values) {
			// Collect selected rows
			let selected_rows = [];
			list_prices_dialog.$body.find('.row-select:checked').each((i, checkbox) => {
				let row_index = checkbox.getAttribute('data-row');
				selected_rows.push(row_index);
			});

			// Close the dialog
			list_prices_dialog.hide();
			
			// Process the selection
			if(selected_rows.length > 0) {
				update_list_prices_exec(frm, selected_rows);
			}
		},
		on_page_show() {
			// Handle "select all" checkbox after the dialog is shown
			list_prices_dialog.$body.find('#select_all')[0].addEventListener('change', function() {
				let checkboxes = list_prices_dialog.$body.find('.row-select');
				checkboxes.each((i, checkbox) => {
					checkbox.checked = this.checked;
				});
			});
			
			// Add event listener to each row checkbox to handle deselection of "select all"
			list_prices_dialog.$body.find('.row-select').each((i, checkbox) => {
				checkbox.addEventListener('change', function() {
					if (!this.checked) {
						list_prices_dialog.$body.find('#select_all')[0].checked = false;
					} else {
						// Check if all row checkboxes are checked
						let allChecked = true;
						list_prices_dialog.$body.find('.row-select').each((i, rowCheckbox) => {
							if (!rowCheckbox.checked) {
								allChecked = false;
							}
						});
						list_prices_dialog.$body.find('#select_all')[0].checked = allChecked;
					}
				});
			});
			
			// Add event listener to each row to toggle checkbox when clicking on the row
			// Base the selector on the checkboxes to exclude rows without a visible checkbox
			list_prices_dialog.$body.find('.row-select').parent().parent().each((i,row) => {
				row.addEventListener('click', function(event) {
					if (event.target.tagName !== 'INPUT') {
						let checkbox = this.querySelector('.row-select');
						checkbox.checked = !checkbox.checked;

						// Trigger change event manually to handle "select all" logic
						checkbox.dispatchEvent(new Event('change'));
					}
				});
			});
		}
	});

	list_prices_dialog.show();	
}

function update_list_prices_exec(frm, sel_items) {
	    frappe.call({
        "method": "senstech.scripts.tools.set_price_list_rates",
        "args": {
            "doc": frm.doc,
            "sel_items": sel_items
        },
        "callback": function(response) {
        }
    });
}


// Assign price list to purchasing/sales doc depending on document's currency
function assign_price_list_by_currency(frm) {
	let buying_or_selling = frm.doc.selling_price_list ? 'selling' : 'buying';
	let price_list_field = buying_or_selling+'_price_list';
	
	// If the currency and price list correspond to system defaults, assume they match. Otherwise, find a price list matching the document's currency
	if(frm.doc.currency != frappe.sys_defaults.currency || frm.doc[price_list_field] != frappe.sys_defaults[price_list_field]) {
		let price_list_filters = {enabled: true, currency: frm.doc.currency};
		price_list_filters[buying_or_selling] = true;
		frappe.db.get_list("Price List", {fields: ['name'], filters: price_list_filters}).then(f => {
			if(f.length == 1) {
				frm.set_value(price_list_field, f[0]['name']);
				frappe.show_alert({message: __('Währungswechsel: Preisliste \'{0}\' zugewiesen', [f[0]['name']]), indicator: 'green'}, 5);
			}
			else {
				frm.set_value(price_list_field, frappe.sys_defaults[price_list_field]);
				
				if(f.length > 1) {
					frappe.show_alert({message: __('Es existieren mehrere Preislisten für die gewählte Währung'), indicator: 'orange'}, 10);
				}
				if(buying_or_selling === 'buying'){
					frappe.show_alert({message: __('Keine Einkaufs-Preisliste für Währung \'{0}\' definiert. Es stehen keine Listenpreise zur Verfügung!', [frm.doc.currency]), indicator: 'orange'}, 10);
				}
				else {
					frappe.show_alert({message: __('Keine Verkaufs-Preisliste für Währung \'{0}\' definiert. Es werden umgerechnete {1}-Preise angezeigt.', [frm.doc.currency, frappe.sys_defaults.currency]), indicator: 'orange'}, 10);
				}
			}
		});
	}	
}


// Show UOM of purchasing/sales docs in "rate" column as we don't have space to show it as a separate column
function add_uom_to_rate_fields(frm) {
    let target = frm.fields_dict.items.$wrapper.find('.grid-body .data-row div.col[data-fieldname="rate"]');
	let child_dt = frm.fields_dict.items.grid.doctype;
    
    target.each(function(index){
        let static_area = $(this).find('.static-area')[0];
		let uom = locals[child_dt][frm.doc.items[index].name]['uom'];
        $(static_area).text(add_uom_to_rate(uom, $(static_area).text()));
        
    	let newObserver = new MutationObserver( (chgs) => {
    	    if(chgs.length > 0 && chgs[0].addedNodes.length > 0 && chgs[0].addedNodes[0].nodeName == 'DIV' && chgs[0].addedNodes[0].firstChild){
    	        let childNode = chgs[0].addedNodes[0].firstChild;
				if(childNode.textContent) {
					uom = locals[child_dt][frm.doc.items[index].name]['uom'];
					childNode.textContent = add_uom_to_rate(uom, childNode.textContent);
				}
    	    }
        });
        newObserver.observe(this, {subtree: true, childList: true});
    });
}

function add_uom_to_rate(uom, rate) {
    if (rate.match(/\d{1}.\d{2}$/)) {
        return rate+' / '+uom;
    } else {
        return rate;
    }
}


// Event handling for modified UOM-related UI in the item table, including the fields 'qty_in_stock_uom' and 'copy_of_stock_uom' as well as showing the UOM directly in the table rows
// Applies to QN, SO, DN, SI, PO, PR, PI
// (BO is not UOM-aware at all, RQ has no stock-related fields)
function handle_custom_uom_fields(dt) {
	let child_dt = dt+' Item';
	
	frappe.ui.form.on(dt, {
		refresh(frm) {
			if(!frm.doc.__islocal) {
				frm.doc.items.forEach(function(item, idx) {
					frappe.model.set_value(child_dt, frm.doc.items[idx].name, 'qty_in_stock_uom', item.stock_qty);
					frappe.model.set_value(child_dt, frm.doc.items[idx].name, 'copy_of_stock_uom', item.stock_uom);
				});
			}
			// qty_in_stock_uom is writable on submitted docs to allow it to always be set to the value of stock_qty,
			// however it should not be user editable when the doc is submitted
			if(frm.doc.docstatus > 0) {
				frm.fields_dict.items.grid.fields_map.qty_in_stock_uom.read_only = 1;
			}
			if(dt != 'Delivery Note') {
				setTimeout(function(){
					add_uom_to_rate_fields(frm);
				}, 1000);
			}
		},
	});
	
	if(['Quotation', 'Sales Order', 'Delivery Note', 'Sales Invoice'].includes(dt)) {
		frappe.ui.form.on(child_dt, {
			item_code(frm, cdt, cdn) {
				// Workaround for a pricing bug in sales docs:
				// Set the 'margin' to zero to prevent it from being added to the 'rate' when a new item is selected
				frappe.model.set_value(cdt, cdn, "margin_rate_or_amount", "0");
			},
		});
	}
	
	let is_handling_qty_event = false;
	frappe.ui.form.on(child_dt, {
		stock_uom(frm, cdt, cdn) {
			// This one is read only and is set by scripts
			frappe.model.set_value(cdt, cdn, 'copy_of_stock_uom',locals[cdt][cdn].stock_uom);
		},
		
		qty_in_stock_uom(frm, cdt, cdn) {
			// Set qty accordingly, this will trigger a script that will set stock_qty
			let val = locals[cdt][cdn].qty_in_stock_uom / locals[cdt][cdn].conversion_factor;
			if(!is_handling_qty_event) {
				is_handling_qty_event = true;
				frappe.model.set_value(cdt, cdn, 'qty', val).then(() => {
					is_handling_qty_event = false;
				});
			}
		},
		
		qty(frm, cdt, cdn) {
			if(!is_handling_qty_event) {
				is_handling_qty_event = true;
				frappe.model.set_value(cdt, cdn, 'qty_in_stock_uom', locals[cdt][cdn].qty * locals[cdt][cdn].conversion_factor).then(() => {
					is_handling_qty_event = false;
				});
			}
		},
		
		price_list_rate(frm, cdt, cdn) {
			// When a new item is selected, price_list_rate is triggered after the details have been fetched => Item-specific code can go here
			// (This will usually also trigger when a new UOM is selected for the item)
			let current_item = locals[cdt][cdn];
			frappe.model.set_value(cdt, cdn, 'qty_in_stock_uom', current_item.stock_qty);
			frappe.model.set_value(cdt, cdn, 'copy_of_stock_uom',current_item.stock_uom);
		},
	});
}