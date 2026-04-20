package org.example.mypokerspring;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class MyPokerSpringApplication {

    public static void main(String[] args) {
        SpringApplication.run(MyPokerSpringApplication.class, args);
    }

}
