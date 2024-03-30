/* It's a class that returns a JSON object with a status code and a message */
class ResponseCodes {
	constructor() { }

	success() {
		var data = {
			status: 200,
			message: this.message != null || this.message != undefined
				? this.message
				: "Request was success",
			data: this.data != null || this.data != undefined ? this.data : [],
			error: {}
		};
		if (this.pagination) {
			data.pagination = this.pagination;
		} else {
			this.pagination = null;
		}
		this.message = null;
		this.data = null;
		return data;
	}

	badRequest() {
		var data = {
			status: 400,
			message:
				this.message != null || this.message != undefined
					? this.message
					: "Oops! Invalid request, please recheck information!",
			error: this.error,
			data: []
		};
		this.message = null;
		this.error = null;
		return data;
	}

	dataNotFound() {
		var data = {
			status: 404,
			message:
				this.message != null || this.message != undefined
					? this.message
					: "Oops! Resource not found, try something different!",
			data: [],
			error: {}
		};
		this.message = null;
		return data;
	}

	unauthorized() {
		var data = {
			status: 401,
			message:
				this.message != null || this.message != undefined
					? this.message
					: "Sorry! Unauthorized access requested!",
			error: this.error,
			data: []
		};
		this.message = null;
		this.error = null;
		return data;
	}

	forbidden() {
		var data = {
			status: 403,
			message:
				this.message != null || this.message != undefined
					? this.message
					: "Oops! Forbidden access",
			error: this.error,
			data: []
		};
		this.message = null;
		this.error = null;
		return data;
	}

	serverError() {
		var data = {
			status: 500,
			message:
				this.message != null || this.message != undefined
					? this.message
					: "Due to some technical issue we cannot process your request, please check back later!",
			error: this.error,
			data: []
		};
		this.message = null;
		this.error = null;
		return data;
	}

	serverUnavailable() {
		var data = {
			status: 503,
			message:
				this.message != null || this.message != undefined
					? this.message
					: "Sorry! Our servers are down right now, please check back later!",
			error: this.error,
			data: []
		};
		this.message = null;
		this.error = null;
		return data;
	}
}
module.exports = ResponseCodes;