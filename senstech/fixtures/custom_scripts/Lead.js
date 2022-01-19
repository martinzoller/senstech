frappe.ui.form.on('Lead', {
	refresh(frm) {
		if (!frm.doc.__islocal) {
			frm.add_custom_button(__("Lead zuweisen"), function() {
				lead_zuweisen(frm);
			});
		}
	}
})

function lead_zuweisen(frm) {
	frappe.prompt([
		{'fieldname': 'user', 'fieldtype': 'Link', 'label': __('User'), 'reqd': 1, 'options': 'User'}  
	],
	function(values){
		assign_lead(frm, values.user)
	},
	__('Auswahl User'),
	__('Zuweisen')
	)
}

function assign_lead(frm, user) {
    frappe.call({
        "method": "frappe.desk.form.assign_to.add",
        "args": {
            "assign_to": user,
            "doctype": "Lead",
            "name": cur_frm.doc.name,
            "description": __("Lead Zuweisung")
        },
        "callback": function(response) {
            cur_frm.set_value("lead_owner", user);
			cur_frm.save();
			frappe.msgprint(__("Die Zuweisung wurde vollzogen."));
        }
    });
}