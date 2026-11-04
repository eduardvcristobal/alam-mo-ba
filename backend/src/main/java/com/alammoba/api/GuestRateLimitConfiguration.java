package com.alammoba.api;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class GuestRateLimitConfiguration implements WebMvcConfigurer {
    private final GuestRateLimitInterceptor interceptor;
    public GuestRateLimitConfiguration(GuestRateLimitInterceptor interceptor){this.interceptor=interceptor;}
    @Override public void addInterceptors(InterceptorRegistry registry){registry.addInterceptor(interceptor);}
}
