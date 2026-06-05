<%
Sub InitializeFID()
	If Not IsObject(Session("FIDList")) Then
		Set Session("FIDList")=Server.CreateObject("Scripting.Dictionary")
		Session("FID")=0
	End If
End Sub


'生成表单的唯一标识符,下面这个函数GenerateFID()用于生成表单的唯一标志。该函数首先将FID值加1，然后返回它：

Function GenerateFID()
	InitializeFID
	Session("FID") = Session("FID") + 1
	GenerateFID = Session("FID")
End Function

'当表单成功地提交时，在Dictionary对象中登记它的唯一标识：
Sub RegisterFID()
	Dim strFID
	InitializeFID
	strFID = Request("FID")
	Session("FIDlist").Add strFID, now()

End Sub

'在正式处理用户提交的表单之前，应该在Dictionary对象中检查它的FID是否已经登记。下面的CheckFID()函数用来完成这个工作，如已经登记，它返回FALSE，否则返回TRUE:

Function CheckFID()
	Dim strFID
	InitializeFID
	strFID = Request("FID")
	CheckFID = not Session("FIDlist").Exists(strFID)
End Function
%>
