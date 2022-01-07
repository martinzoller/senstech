frappe.ui.form.on('Communication', {
	refresh(frm) {
        frm.add_custom_button('Unlink E-Mail Queue', function() {
			unlinke_email_queue(frm);
	    });
    }
})

function unlinke_email_queue(frm) {
    frappe.call({
        "method": "senstech.utils.unlinke_email_queue",
        "args": {
            "communication": cur_frm.doc.name
        }
    });
    frappe.msgprint(__("Unlinked"));
}