frappe.ui.form.on('Asset', {
	before_submit(frm) {
		// make sure assets is in an inventory naming series
		if ((!frm.doc.name.startsWith("IK")) && (!frm.doc.name.startsWith("PC"))) {
		    validation_error(frm, "name", __("Bitte die Anlage mit der Inventarnummer (Excel) benennen (Klick oben links)."));
		}
	}
});
