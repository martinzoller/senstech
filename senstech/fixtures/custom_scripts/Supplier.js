frappe.ui.form.on('Supplier', {
    onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
    },
	after_save(frm) {
        var bezeichnung = cur_frm.doc.supplier_name + " (" + cur_frm.doc.name + ")";
        if(cur_frm.doc.bezeichnung != bezeichnung) {
            cur_frm.set_value('bezeichnung', bezeichnung);
            cur_frm.save();
		}
	}
});
