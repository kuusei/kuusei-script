package main

import (
	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	r.POST("/screen-studio/api", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"valid": true,
			"data":  "valid code",
		})
	})

	r.Run(":8080")
}
