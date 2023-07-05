frappe.ui.form.on('Quotation', {
    before_save(frm) {
		fetch_templates_from_party(frm);
	},
    party_name(frm) {
        setTimeout(function(){
            fetch_templates_from_party(frm);
        }, 1000);
    },
    refresh(frm) {
        if (cur_frm.doc.customer_address && cur_frm.doc.shipping_address_name) {
            update_address_display(frm, ['address_display', 'shipping_address'], [cur_frm.doc.customer_address, cur_frm.doc.shipping_address_name], true);
        } else {
            if (cur_frm.doc.customer_address) {
                update_address_display(frm, 'address_display', cur_frm.doc.customer_address);
            }
            if (cur_frm.doc.shipping_address_name) {
                update_address_display(frm, 'shipping_address', cur_frm.doc.shipping_address_name);
            }
        }
    },
	onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
        // "In Worten" auch nicht
        jQuery('div[data-fieldname="base_in_words"]').hide();
    },
    validate(frm) {
		basic_sales_validations(frm);
        reload_contacts(frm);
    },
    before_submit(frm) {
        cur_frm.doc.submitted_by = frappe.user.name;
    },
    on_submit(frm) {
        attach_pdf_print(frm);
    },
    after_cancel(frm) {
        add_cancelled_watermark(frm);
    }
});

frappe.ui.form.on('Quotation Item', {
	items_add: function(frm, cdt, cdn) {
		set_position_number(frm, cdt, cdn);
   }
});


function fetch_templates_from_party(frm) {
    if(!cur_frm.doc.party_name) {
        return;
    }
    frappe.call({
        "method": "frappe.client.get",
        "args": {
            "doctype": cur_frm.doc.quotation_to,
            "name": cur_frm.doc.party_name
        },
        "callback": function(response) {
            var customer = response.message;

            if (!cur_frm.doc.taxes_and_charges && customer.taxes_and_charges) {
                cur_frm.set_value('taxes_and_charges', customer.taxes_and_charges);
            }
            if(!cur_frm.doc.payment_terms_template && customer.payment_terms){
                cur_frm.set_value('payment_terms_template', customer.payment_terms);
            }
        }
    });
}