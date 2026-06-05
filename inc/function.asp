<%

Sub GetSafeCode	
	Dim test,Result
	 on error resume next
	Set test=Server.CreateObject("Adodb.Stream")
	Set test=Nothing
	If Err Then
		Dim zNum
		Randomize timer
		zNum = cint(8999*Rnd+1000)
		Session("SafeCode") = zNum
		Result = Session("SafeCode")		
	Else
		Result = "<img src=""../inc/Safecode.asp"" align=""absmiddle""   >"		
	End If
	Response.Write Result
End Sub

%>