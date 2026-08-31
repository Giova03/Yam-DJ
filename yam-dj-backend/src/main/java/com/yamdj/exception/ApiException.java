package com.yamdj.exception;

import org.springframework.http.HttpStatus;

/**
 * Exception metier avec statut HTTP associe.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;

    public ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
